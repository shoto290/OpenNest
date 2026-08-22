# Per-bot plugins — observed behaviour

Everything below was measured against the real install before any code was written,
the same way `PROTOCOL.md` was. Claude Code **2.1.237** and
`@anthropic-ai/claude-agent-sdk` **0.3.x** on macOS. The SDK's version tracks the
executable's (`0.3.201` ships `2.1.201`), and the SDK translates its options into
the CLI flags below, so a fact measured on one holds on the other.

## Shape

A bot is a plugin directory that is loaded for the session and never installed:

```
<bot>/
  .claude-plugin/plugin.json     name, version, optional "mcpServers": "./.mcp.json"
  agents/<slug>.md               frontmatter + body (the bot's system prompt)
  skills/<name>/SKILL.md         catalogue entries, loaded on demand
  .mcp.json                      servers this bot may reach
```

This app lays those out under one marketplace, so a reader adds a single path and
has every bot rather than one plugin at a time — see `bundles.rs`:

```
<app data>/bots/
  .claude-plugin/marketplace.json   every bot, by id and relative source
  plugins/<bot id>/                 the bundle above, one per bot
```

A name is not an identity — it changes, and two bots can share one — so the plugin is
named by the bot's id and carries the reader's name as `displayName`, the generated
agent marks itself with the id under `metadata`, and the session promotes the
namespaced `<bot id>:<agent>`. The bare form resolves too, and it would race a
`~/.claude/agents/<slug>.md` the reader wrote.

The generated files are the manifest and the one agent. Everything else in a bundle
belongs to whoever put it there, and the agent file on the disk is the truth: a body
edited by hand is adopted, and the stored value is the fallback for a bundle that has
gone missing.

```ts
query({ options: {
  plugins: [{ type: "local", path: bundlePath }],   // → --plugin-dir
  agent: `${pluginName}:${slug}`,                   // → --agent
  systemPrompt: { type: "preset", preset: "claude_code", append },
  settingSources: [...],                            // → --setting-sources
}})
```

## Loading — verified

`--plugin-dir` loads a directory that was never installed. The init frame reports it
as `source: "<name>@inline"` with its path, nothing is written to `~/.claude`, and
the plugin's `.mcp.json` servers connect as `plugin:<name>:<server>`.

`--agent` resolves an agent from that directory under both its bare name (`probe`)
and its namespaced name (`spike:probe`).

## `agent` without `systemPrompt` is silently ignored — verified

Under the SDK, omitting `systemPrompt` starts a minimal prompt and **the agent's body
is never applied**. The failure is silent: the agent still resolves, its `model` is
still honoured, it still appears in the init frame's agent list, and it answers as
plain Claude.

| Options | Reply to "what is your codename?" |
| --- | --- |
| `agent` only | "Claude." |
| `agent` + `systemPrompt` preset | "ORCHID." |

The preset in `providers/claude/session.ts` is therefore **required for `agent` to do
anything at all**, not merely a way to keep Claude Code's own prompt. Removing it
looks like a simplification and silently strips every bot of its brief.

`append` composes with `agent`: a bot answered `"ORCHID OPENNEST-GLOBAL"` with both set.

## Frontmatter — what survives promotion

An agent file is written to be *delegated*. Promoting it to the main thread honours
only part of it.

| Field | Delegated | Promoted via `agent` |
| --- | --- | --- |
| body | system prompt | system prompt |
| `model` | honoured | honoured, and `--model` overrides it |
| `tools` / `disallowedTools` | honoured | honoured — `tools` dropped a session to exactly `[Bash, Read]`, and `disallowedTools: [Bash, Edit, Write, NotebookEdit]` took it from 33 tools to 29 |

| `description` | routes delegation | unused |
| `skills` | **preloads full content** | **inert** |
| `permissionMode` | honoured | **ignored** — session stayed `default` under `bypassPermissions` |

A bundle can therefore *reduce* capability but never *raise* it: a bot declaring
`bypassPermissions` cannot escape the host's permission gate. The one surface that
does add capability is the bundle's `.mcp.json`, which starts processes.

## `skills:` does not preload on the promoted path — verified

The documentation states the field injects "the full skill content, not only the
description". That holds when the agent is delegated, and not when it is promoted.
Four converging measurements:

| Path | `skills:` declared | `Skill` tool called | Content present at turn 0 |
| --- | --- | --- | --- |
| delegated via `Task` | yes | no | yes |
| promoted, non-triggering skill | yes | no | never received |
| promoted, plain fact to recall | yes | **yes** | no |
| promoted, no field at all | no | yes | no |

The third row is decisive: the skill held `Build 7741 has the codename ORCHID-SPICE`,
no instruction and so no injection smell, and the promoted agent had to fetch it.

Skills still work: a skill whose `description` is imperative is loaded at turn 1 and
stays resident afterwards (turn 2 required no reload). But the loading is the model's
judgement, it costs a round trip, and it lives in the conversation, so compaction can
evict it. A body full of "answer in one short line" was enough to stop an agent from
loading its own skills at all.

## The compiled body — the mechanism this repo uses

What must be true on every turn goes in the agent's body, which is the system prompt
on both paths.

- A 42 KB body was loaded whole; a fact buried in its middle came back with no tool call.
- The same compiled agent, **delegated**, answered from its body too. Promoted and
  delegated behave identically.
- Consequence: `skills:` must be **absent** from a compiled agent. Left in, a delegated
  run would preload the content that the body already carries, doubling it and making
  the bot behave differently depending on who called it.
- `permissionMode` must likewise never appear in a bundle; the host owns permissions.

With those two rules, one file behaves the same whether OpenNest promotes it, Superset
launches it, or an orchestrator delegates to it.

### It is worth the tokens

`frontend-engineer` (17 declared skills, 47 KB compiled) was asked the same question in
both forms. Neither called `Skill`. On disabling a submit button:

- classic: "Save disabled unless `isDirty && isValid`"
- compiled: "submit disabled on `isSubmitting` only, never on `!isValid`"

Its own `forms-validation` skill, line 17: *"Disable submit during `isSubmitting`; never
gate it on `!isValid`"*. The classic form contradicts its own doctrine, with confidence
and without ever consulting it. Cost: about 11k extra prompt tokens, 0.9 s, and prompt
cache engaged from the second call.

### A carried skill is still in the catalogue — verified

A skill copied into the body does not leave the session: it is still a
`skills/<name>/SKILL.md` in the bundle, so it is still listed for the `Skill` tool. Same
bundle, same question, only the skill's frontmatter differing:

| Skill frontmatter | `Skill` tool called | Answer |
| --- | --- | --- |
| carried in the body | **yes** | correct, after a round trip |
| carried, plus `disable-model-invocation: true` | no | correct, straight from the body |

The first row is the cost: the model fetched what it had already been given, paying a
round trip for it and leaving the same text in context twice.

- Consequence: **preloading and model invocation are contradictory settings.** A skill
  whose body is in the system prompt has nothing left to be invoked for, and leaving it
  invocable buys a duplicate.
- Whatever writes `metadata.opennest.preload` should write `disable-model-invocation`
  beside it. That is a decision about a file the reader owns, so it belongs to the
  interface that marks a skill, not to the writer that carries one.

## Resume — flags are not sticky

`--resume` **without** re-passing `--plugin-dir` and `--agent` replays the conversation
but reloads neither: the plugin is absent from the init frame and the agent no longer
exists. The bot still sounds like itself because it reads its own transcript, so the
loss is invisible. Re-passing both restores everything, brief included.

**Every option is rebuilt on every spawn.** Never once at first launch.

## Isolation

Every session is built with **`settingSources: []`** and **`strictMcpConfig: true`**,
with or without a bundle. That is what makes an exported bot the same bot anywhere.

`--setting-sources project --strict-mcp-config` cut a session from 203 tools to 33,
100 skills to 17, 24 agents to 6 and 14 MCP servers to 0, leaving only the bundle.
`[]` goes one step further than `project`: it drops the `CLAUDE.md` files too, which
`project` still reads. Default (no `settingSources`) inherits the user's whole
configuration, including `SessionStart` hooks.

`strictMcpConfig` ignores every MCP configuration that was not passed as an option —
project `.mcp.json`, user settings, **and plugins**. A bundle declaring a server would
therefore need it named in `mcpServers`; none does today.

Measured live (`tests/real_claude.rs`, `#[ignore]`), one turn, two words planted where
a default session reads them:

| Planted in | Reaches the child |
| --- | --- |
| `CLAUDE.md` of the session's cwd | **no** — the child answers `NONE` |
| `~/.claude/projects/<cwd-slug>/memory/MEMORY.md` | **yes** |

So `memory_paths.auto` keeps pointing at `~/.claude/projects/<cwd-slug>/memory/` under
`settingSources: []`, and two bots sharing a working directory still share that memory.
The bundle's own brief survives both options — the same turn obeyed it.

## The tool names come off the `init` frame — verified

There is no control request that lists tools: `initializationResult()` carries
commands, agents, models and the account, and no tool names. The `system` / `init`
message carries `tools`, and nothing else does.

The frame is emitted **when a turn begins**, never before it. A streaming session
opened and left unprompted for 20s produced two `hook_started` / `hook_response`
pairs and no `init`; the same session prompted with one character produced `init`
3.9s later, ahead of any reply. Reading the catalogue therefore costs a turn that
is started and closed on the frame, unlike `supportedModels()`, which costs a
handshake.

The list is the *effective* one: it holds every built-in the session was given plus
every `mcp__<server>__<tool>` its configuration reached, and it leaves out whatever
`disallowedTools` denied — which is why a bot's own session cannot be asked what it
denies. The catalogue is taken from a session of the install's own, in a temporary
directory, with the `mcp__` names filtered out.

## Deliberately not used

- `--append-system-prompt-file` works and takes any size, but it is absent from `--help`
  and only mentioned inside the `--bare` blurb. The compiled body removes the need for it.
- `@path` imports inside an agent body are **not** resolved. The model receives the path
  as text and tries to `Read` it.
