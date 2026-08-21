# Agent sidecar — the protocol the host speaks

Every conversation turn goes through the sidecar (`apps/app/sidecar`), a single
compiled Bun binary carrying its provider's own agent SDK. The host never spawns
an agent itself: it spawns the sidecar, and the sidecar decides how its provider
is spelled. Nothing below names a CLI flag, because the host no longer sets any —
a second provider is one more module inside the sidecar.

The host resolves no executable of its own. Its connection state and its model
catalogue are both asked of the sidecar, so nothing here reads a `PATH`.

## Process shape

```
opennest-agent --serve [--provider=<id>]
```

**One process for every session.** stdin is NDJSON commands from the host, stdout
is NDJSON frames back, stderr is a separate pipe the host drains and discards. A
session is a lane on that one pipe, opened and closed by command, and the process
outlives every one of them.

## Handshake

The sidecar's first stdout line, before any session exists:

```json
{"type":"ready","provider":"<id>","version":"2.1.237","sdkVersion":"0.3.237",
 "capabilities":["partialMessages","resume","interactivePermissions","modelCatalogue"]}
```

Same payload `--probe` prints. `capabilities` is a contract, not a description:
what the sidecar does not announce, the host does not ask for — a build that
names no `partialMessages` is opened with `includePartialMessages: false`, and
the reader sees whole messages instead of a stream that would never arrive.

A sidecar that never announces itself surfaces as `startupTimeout`; one that dies
first, as `crashed`.

## Host → sidecar

Two commands name no session, because they are about the install rather than
about a conversation. Each is asked once per launch and cached by the host.

Each is answered under the type it was asked, so one name stands for the ask and
its answer both.

| `type` | Answered with | Becomes |
| --- | --- | --- |
| `check` | `{"type":"check","authenticated":bool,"detail"?:string}` | the `CheckReport` |
| `models` | `{"type":"models","models":[…]}` | the model catalogue |

`check` reads the provider's own credential store; `detail` says the question
could not be answered at all, which reaches the frontend as `authCheckFailed`
rather than as `notAuthenticated`. `models` is `Query.supportedModels()`, asked of
a session opened for nothing else and closed again — there is no file to read and
no endpoint to ask.

Every other command names its session.

| `type` | Carries | Becomes |
| --- | --- | --- |
| `open` | `cwd`, `resume?`, `pluginPath?`, `agent?`, `partialMessages`, `env?` | `query()` options |
| `prompt` | `text` | one `SDKUserMessage` on the session's prompt stream |
| `interrupt` | — | `Query.interrupt()` |
| `permission` | `requestId`, `decision` | the `canUseTool` promise's answer |
| `close` | — | the prompt stream ends and `Query.close()` runs |

`open` maps to SDK options directly:

- `resume` is the SDK's `resume`. The stored id is tried first; a refusal falls
  back to a fresh session and the id is given up on only when the refusal was a
  crash — see `commands.rs::start_with_fallback`.
- `pluginPath` is the bot's own plugin bundle, loaded for the session and never
  installed, and `agent` is the agent inside it the main thread is promoted to,
  namespaced as `<plugin>:<agent>` so it cannot resolve to one of the reader's own.
  What the bot was told is that agent's body — see `PLUGINS.md` for what was
  measured, and `bundles.rs` for what is written. Both are re-sent on every spawn,
  a resume included: neither is carried across one.
- the provider's own preset system prompt stays set on every spawn that names an
  `agent`. Measured, not documented: without it the agent resolves and its body is
  never applied.
- `settingSources` is deliberately left out, which is what makes the SDK load the
  settings on disk and the instruction files they reach — the CLI defaults.
- `env` is the SDK's `env`: variables for the agent this session runs, not for
  the sidecar.

## Sidecar → host

Every line is an envelope:

```json
{"session":"<key>","frame":{…}}
```

The frame is an `SDKMessage` verbatim, plus the three the sidecar adds itself.

| `frame.type` | Source | Mapped to |
| --- | --- | --- |
| `opened` | the sidecar, once `initializationResult()` returns | the start's readiness gate |
| `closed` | the sidecar, when the query ends or throws | `crashed` |
| `system` / `init` | `SDKSystemMessage` — `session_id` | `sessionReady` |
| `commands` | the sidecar, from `initializationResult().commands` | `commandsListed` (only when the frame names one) |
| `stream_event` | `SDKPartialAssistantMessage` — one Messages API streaming event | `messageStarted` / `messageDelta` / `activity` |
| `assistant` | `SDKAssistantMessage` — `text` and/or `tool_use` blocks | `messageCompleted` / `activity` |
| `user` | `SDKUserMessage` — `tool_result` with `is_error` | `activity` (succeeded / failed) |
| `result` | `SDKResultMessage` — `subtype`, `session_id`, `is_error` | `turnEnded` |
| `control_request` / `can_use_tool` | the sidecar, from `canUseTool` | `permissionRequested` |

Every other `SDKMessage` type is dropped: `translate.rs` reads what the contract
needs and nothing else, so a new SDK message is inert until it is asked for.

## Permissions

`canUseTool` is a promise the SDK blocks the tool on. The sidecar answers it out
of band: it emits the request under the SDK's own `requestId`, and the host's
`permission` command resolves it.

```json
{"type":"permission","session":"…","requestId":"…",
 "decision":{"behavior":"allow","updatedInput":{…}}}
```

`{"behavior":"deny","message":"…"}` produces a `tool_result` with `is_error:
true` and the turn continues. A session closing settles every promise it still
holds as a denial: an unanswered one would block its tool forever, since a
permission prompt has no deadline of its own.

## Stop and shutdown

- `interrupt` ends the turn with `result.subtype = "error_during_execution"` and
  **leaves the session usable**: a following prompt answers normally.
- `close` ends one session and nothing else — the sidecar serves the others.
- The host's exit is the only thing that ends the process: close stdin →
  `SIGTERM` → `SIGKILL`, on the whole group. The sidecar spawns real
  grandchildren (the agent, its MCP servers), so the group kill is what keeps
  orphans off the machine.

## What is deliberately not forwarded

The sidecar's stderr is read so the pipe never fills and then discarded unread —
it is the one channel that could carry an environment value. The sign-in probe
returns an email, an org id, an org name and a subscription type; the provider
module reduces it to one boolean before it reaches the pipe, so the host never
holds any of the rest. Search locations are reported as labels
(`$OPENNEST_AGENT_SIDECAR`, the app's own directory) rather than raw environment
values, and `redact` collapses the home directory out of every path *and* every
shell command before it crosses to React. There is no logging statement anywhere
in the module.
