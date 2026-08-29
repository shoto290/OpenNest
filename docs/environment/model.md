# ENV — Environment model

A bot's `.mcp.json` is auto-committed. Every token an MCP server needs is therefore written into a
file that leaves the machine, and the previous attempt at this feature answered that with six
commands, two cascades and three reference grammars because no document held the model. This one
does: ENV2 (the Rust store), ENV3 (sidecar injection and the chat tool) and ENV4 (app wiring) read
it before writing code and cite it instead of rederiving it.

The goal is one sentence. **MCP server tokens leave the auto-committed `.mcp.json` of a bot and are
injected at session launch**, from a store that lives outside any committed directory, through
references the configuration carries in place of the values.

## Scopes

Three entities carry an environment, and nothing else does.

| Scope | Carried by | Owns MCP servers |
| --- | --- | --- |
| `space` | a space | yes |
| `bot` | a bot | yes |
| `server` | one MCP server declared by a space or by a bot | no |

A space owns MCP servers of its own, so a server belongs either to a space or to a bot, never to
both. The servers a session loads resolve **space servers then bot servers** — the bot's own
declarations are added to the ones its space already provides, and a bot server declared under a
name the space already uses replaces it for that session.

## Merge order

A session's environment merges **space, then bot, then server**, the narrowest scope winning on an
equal name. A server's own `env` beats the bot's, which beats the space's. There is no second
cascade and no per-key exception: one order, applied once, at launch.

The panel that shows a scope's variables names both ends of that resolution on every row, because a
name written in a space can be silently replaced by a bot or by a server three screens away.

## Storage

Each scope stores its variables in a file named `.env`, mode `0600`, in the per-entity directory of
that scope — outside any auto-committed plugin directory. The file is the store; there is no index,
no database and no second copy. A scope with no variables has no file.

Mode `0600` is part of the contract, not a detail of the first implementation: a store readable by
another account is not a store.

## No read path

**No read path for a value exists.** Not in the Rust commands, not in the sidecar API, not in the
interface. A value is written, and from that moment the only surface that ever sees it again is the
process the session launches.

A wrong value is corrected by replacement — the reader types the new one in full. There is no
reveal, no copy, no "show once", and no round-trip that would let a value re-enter the interface to
be edited in place.

## What a bot may know

A bot reads **key names and their scope**, for the space, the bot and the servers its own session
resolves. Never for another session, never for another space. The answer to "what do you have?" is
a list of names with a scope beside each, and nothing more.

An MCP server receives only the keys **its own configuration declares** — never the union of its
scope. A server that declares one key starts with one key, even when the bot holds twelve.

No value appears in a log line, an error message or a transcript. Key names alone are reportable: a
launch that fails for a missing variable names the variable, a store that fails to write names the
key, and neither ever carries what the value was.

## Reference grammar

An MCP configuration carries references, not values.

```
${VAR}
${VAR:-default}
```

`${VAR}` is required: a launch whose configuration names a variable the merged environment does not
hold **fails**, and the server does not start. `${VAR:-default}` falls back to the literal after
`:-` when the name is absent.

Expansion runs in `command`, `args`, `env`, `url` and `headers`. Nowhere else — a reference written
into any other field is left as written.

The configuration carrying the resolved values is written to a file with mode `0600` and passed to
the CLI **by path**. It never travels on the argv, where any other process on the machine could
read it out of the process list.

## The proposal tool

A bot that needs a variable asks for it; it never receives one it can read back.

| Step | Who | What |
| --- | --- | --- |
| 1 | bot | calls the tool naming a key, and a reason |
| 2 | host | opens its own input, outside the transcript, masked |
| 3 | reader | types a value, or declines |
| 4 | tool | returns `saved` or `declined`, with the key name |

The tool does not return until the reader answers. The value never passes through the bot's turn,
its arguments or its result — the host writes it to the store and answers with the outcome and the
key name alone.

## The panel

`packages/ui/src/components/bot-settings-dialog/environment-panel.tsx` is the surface for one
scope. It takes the viewed scope, its entries, `onSet` and `onDelete`, and it carries no value in
any prop.

```ts
type EnvironmentEntry = {
	name: string
	definedIn: EnvironmentScope
	servedFrom: EnvironmentScope
	overrides?: EnvironmentScope
}
```

`definedIn` is where this row's definition lives, `servedFrom` is the scope the merge order gives
the name to, and `overrides` names the wider scope this definition replaces. **Resolution across
scopes is computed by the app**, not by the panel: ENV4 walks space, bot and servers, and hands the
panel rows that already say who wins. The panel derives only what it draws — a row is overridden
when it is defined in the viewed scope and served from a narrower one, and overriding when it is
served from the viewed scope and `overrides` names a wider one.

Both callbacks are `void | Promise<void>` and both failures are held in the dialog that asked:

| Callback | Signature | On rejection |
| --- | --- | --- |
| `onSet` | `(write: EnvironmentWrite) => void \| Promise<void>` | the write dialog stays open on the typed name and value, its action disabled while in flight, and states the failure |
| `onDelete` | `(name: string) => void \| Promise<void>` | the confirmation stays mounted on the key it named, its destructive action disabled while in flight, and states the failure |

That is the whole failure channel. A rejected callback never closes a dialog, never clears what was
typed and never reports success — ENV2 and ENV4 may reject freely, and the reader retries in place
rather than typing a secret twice.

## Out of the model

Three things are named here only to be excluded. They are not deferred designs; nothing in ENV2,
ENV3 or ENV4 may assume them.

- The encrypted vault.
- The passphrase.
- The `${secret:...}` grammar.

The store is a `0600` file of plain names and values. A machine whose disk is readable by another
account is outside what this model defends against.
