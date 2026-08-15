# Claude Code transport — observed protocol

Everything below was measured against the local install (**Claude Code 2.1.233**,
macOS) before any code was written. It records what the CLI actually does, not
what the docs promise.

## Process shape

```
claude -p \
  --input-format stream-json --output-format stream-json \
  --verbose --include-partial-messages \
  --permission-prompt-tool stdio \
  [--resume <session_id>]
```

One long-lived child per session. stdin stays open, so **a single process serves
many turns** and keeps its context between them. stdout is NDJSON, stderr is a
separate pipe.

## Frames seen on stdout

| `type` | Carries | Mapped to |
| --- | --- | --- |
| `system` / `init` | `session_id`, `cwd`, tool list | `sessionReady` |
| `system` / `hook_*`, `status`, `session_state_changed` | local hook noise | dropped |
| `stream_event` / `message_start` | assistant message id | `messageStarted` |
| `stream_event` / `content_block_delta` | `text_delta` | `messageDelta` |
| `stream_event` / `content_block_start` (`tool_use`) | tool id + name | `activity` (running) |
| `assistant` | full message, `text` and/or `tool_use` blocks | `messageCompleted` / `activity` |
| `user` | `tool_result` with `is_error` | `activity` (succeeded / failed) |
| `result` | `subtype`, `session_id`, `is_error` | `turnEnded` |
| `control_request` / `can_use_tool` | tool name, description, input | `permissionRequested` |
| `control_response` | ack for a request we sent | consumed by the transport |
| `rate_limit_event` | quota window | dropped |

`session_id` is present on every frame; the transport takes it from `system/init`
and confirms it on `result`.

## Startup handshake

The SDK control protocol is live in the plain CLI. Sending

```json
{"type":"control_request","request_id":"…","request":{"subtype":"initialize","hooks":{}}}
```

gets a `control_response` back within a second. The transport uses that ack as
its readiness gate, which is why a silent binary surfaces as `startupTimeout`
rather than a hang.

## Session resume — verified

`--resume <session_id>` in a **fresh process** replays the conversation: the
second process answered a question that only the first process had been told,
and reported the same `session_id`. Covered by
`tests/real_claude.rs::two_turns_stream_and_the_second_resumes_the_first`.

## Permissions — real, kept in V0.1

The scope said to drop `allowOnce | deny` unless the protocol genuinely supports
it. It does, but only under one condition.

- **Without** `--permission-prompt-tool`: a tool needing approval is
  auto-denied. The `tool_result` comes back with
  `is_error: true` and a "you haven't granted it yet" message, and `result`
  lists the attempt under `permission_denials`. No prompt is ever offered — a UI
  built on this could only report a refusal after the fact.
- **With** `--permission-prompt-tool stdio` plus the `initialize` handshake:
  Claude sends a `can_use_tool` `control_request` and **blocks** until the host
  answers on stdin:

  ```json
  {"type":"control_response","response":{"subtype":"success","request_id":"…",
    "response":{"behavior":"allow","updatedInput":{…}}}}
  ```

  `{"behavior":"deny","message":"…"}` produces a `tool_result` with
  `is_error: true` and the turn continues normally.

Both branches were exercised against the real binary, so `PermissionRequest` and
`respondToPermission` stay in the contract. The request also ships
`permission_suggestions` (e.g. `setMode: acceptEdits`); V0.1 ignores them, which
is why there is no "always allow" in the contract yet.

## Stop — two mechanisms, one chosen

- `control_request` / `interrupt` is acked, ends the turn with
  `result.subtype = "error_during_execution"`, and **leaves the process usable**:
  a following prompt answered normally. This is what `cancelTurn` uses.
- `SIGTERM` on the process group also works but throws the session away. It is
  kept only for `shutdown`, where the escalation is close stdin → `SIGTERM` →
  `SIGKILL` on the group. The child spawns real grandchildren, so the group kill
  is what keeps orphans off the machine.

## What is deliberately not forwarded

`claude auth status` returns an email, an org id, an org name and a subscription
type. It is reduced to one boolean inside `binary.rs`. stderr is read so the pipe
never fills and then discarded unread. Search locations are reported as labels
(`$PATH/claude`, `~/.local/bin/claude`) rather than raw environment values, and
`redact` collapses the home directory out of every path *and* every shell command
before it crosses to React. There is no logging statement anywhere in the module.
