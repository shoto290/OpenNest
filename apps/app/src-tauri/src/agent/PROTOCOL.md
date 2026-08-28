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
 "capabilities":["partialMessages","resume","interactivePermissions","modelCatalogue",
 "toolCatalogue"]}
```

Same payload `--probe` prints. `capabilities` is a contract, not a description:
what the sidecar does not announce, the host does not ask for — a build that
names no `partialMessages` is opened with `includePartialMessages: false`, and
the reader sees whole messages instead of a stream that would never arrive.

A sidecar that never announces itself surfaces as `startupTimeout`; one that dies
first, as `crashed`.

## Host → sidecar

Three commands name no session, because they are about the install rather than
about a conversation. Each is asked once per launch and cached by the host.

Each is answered under the type it was asked, so one name stands for the ask and
its answer both.

| `type` | Answered with | Becomes |
| --- | --- | --- |
| `check` | `{"type":"check","authenticated":bool,"detail"?:string}` | the `CheckReport` |
| `models` | `{"type":"models","models":[…]}` | the model catalogue |
| `tools` | `{"type":"tools","tools":[…]}` | the tool catalogue |

`check` reads the provider's own credential store; `detail` says the question
could not be answered at all, which reaches the frontend as `authCheckFailed`
rather than as `notAuthenticated`. `models` is `Query.supportedModels()`, asked of
a session opened for nothing else and closed again — there is no file to read and
no endpoint to ask.

`tools` is the `tools` of the `init` frame, taken off a session opened for nothing
else and closed the moment the frame lands. No control request answers it, and the
frame is only emitted once a turn has begun — so unlike `models` the ask costs a
turn that is started and never finished. What an MCP server provides is filtered
out before the answer is written: those tools belong to a server rather than to
the install.

Every other command names its session.

| `type` | Carries | Becomes |
| --- | --- | --- |
| `open` | `cwd`, `resume?`, `pluginPath?`, `systemPluginPath?`, `userPluginPath?`, `agent?`, `identity?`, `outputStyle?`, `settingsPath?`, `partialMessages`, `env?` | `query()` options |
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
- `systemPluginPath` is the app's own plugin bundle, loaded beside the bot's for the
  same session and never promoted — nothing in it is an agent. Measured on 2.1.239,
  two local plugins load together and each namespaces its own skills. It is passed
  second, after the bot's, and only carried when a `pluginPath` is: a session with no
  bot bundle loads no plugin at all. Its `.mcp.json` servers are bridged the same way
  the bot's are, with the bot's names winning a clash.
- `userPluginPath` is the person's own plugin bundle, laid down once and owned by them,
  loaded third beside the other two and never promoted. Its `.mcp.json` is not read: the
  person's plugin declares no server. Its preloaded skills ride the layer like the app's,
  above the sentence naming the bot's directory.
- the provider's own preset system prompt stays set on every spawn that names an
  `agent`. Measured, not documented: without it the agent resolves and its body is
  never applied. Its `append` is the OpenNest layer, the same text on every session:
  the speaking situation of a chat, no capability and no tool name, so an exported
  bot loses the chat and nothing else. It is not editable by anyone. A spawn carrying
  a `pluginPath` appends one more sentence, naming that directory as where the bot's
  own skills live — with two plugins loaded, nothing else says which is the bot's.
- `identity` is who the bot is: the host's own sentences over the bot's own name and
  title, rendered on the host side — see `bundles.rs::identity`. It is appended to the
  layer above the OpenNest sentences, and it travels on the request rather than in the
  bundle because the sentences are the app's: no bot's file carries a copy, and a
  rename reaches the next session with nothing rewritten. Left out for a session
  opened with no bot to name, which is a session that carries no plugin either.
- `outputStyle` is the style the answer is written in, by the name the provider knows
  it under (`Concise`…). Named, it is passed as `settings: { outputStyle }` — an
  inline settings object, since `settingSources: []` closes every settings file on the
  machine. Left out, no `settings` key is passed at all.
- `settingsPath` is the `settings.json` lying at the root of the bot's own bundle, sent
  only when the file is there — see `bundles.rs::settings_file`. The sidecar reads it and
  keeps `permissions.allow`, `permissions.ask`, `permissions.deny`,
  `permissions.defaultMode` and `outputStyle`; every other key is dropped —
  `permissions.additionalDirectories` among them, since a bot widening its own reach is
  the thing the floor exists to prevent — `disableBypassPermissionsMode` is forced to
  `disable`, and a `defaultMode` of `bypassPermissions` is refused. What is kept becomes
  the inline `settings` object and `permissionMode` becomes the declared `defaultMode` or
  `auto`. A file the bot's own settings name wins over `outputStyle` on the request. Unreadable or not a JSON object, the session opens
  without it. Anything refused — the file itself, a `bypassPermissions` mode, or a key outside
  the allowlist, named — rides a `settings_rejected` frame to the reader's notice.
  `disableBypassPermissionsMode` is forced to `disable` even for a bot carrying no file at all,
  and `settingSources: []` stays set either way: this is the only settings file a session reads.
- `appDataDir` is the directory the host keeps its own data in, sent when the host knows
  it. The sidecar never reads it: it hands it to the security floor, which the session
  carries as `managedSettings`, the policy tier a bot's own settings cannot loosen. The
  floor denies reading `conversations.sqlite3` and its `-wal`/`-shm` companions,
  `opennest.db`, every `session.json*` and the `attachments` directory — at the
  permission layer and in `sandbox.filesystem.denyRead` both. It keeps `bots` and
  `spaces` in `sandbox.filesystem.denyRead`, lists the session's own plugin paths in
  `allowRead`, and denies the `Read` tool on every other bundle it finds under
  `bots/plugins` and `spaces`. Left out, the rest of the floor still applies: the home
  credential paths, the environment files and the sandbox itself.
- `env` is the SDK's `env`: variables for the agent this session runs, not for
  the sidecar.

## Sidecar → host

Every line is an envelope:

```json
{"session":"<key>","frame":{…}}
```

The frame is an `SDKMessage` verbatim, plus the four the sidecar adds itself.

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
| `control_request` / `can_use_tool`, tool `AskUserQuestion` | the sidecar, from `canUseTool` | `questionRequested` |
| `settings_rejected` | the sidecar, when the bot's `settings.json` is refused in part or in whole | `failed` — `settingsRejected`, the frame's `detail` as its reason |

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

`AskUserQuestion` is the same ask read differently: it travels as
`questionRequested` and is answered by allowing the tool with the reader's
replies written into its input, keyed by the question they answer.

```json
{"type":"permission","session":"…","requestId":"…",
 "decision":{"behavior":"allow","updatedInput":{"questions":[…],"answers":{"Which library?":"date-fns"}}}}
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
