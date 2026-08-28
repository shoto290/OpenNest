# PRF1 — render baseline

Every figure below comes from `apps/app/src/lib/perf/render-baseline.test.ts`, run headlessly
against `createFakeChatDriver` and `createFakeTranscriptStore` with no desktop host.

Scenario: 3 spaces × 2 bots = 6 bots, one bot selected, one turn already settled in the
transcript, then a second turn streamed to completion in three-word chunks. Each transcript row
is counted separately, keyed by its `bubbleIdOf(messageId, blockIndex)` anchor.
Counts are taken from a probe (`packages/ui/src/lib/render-probe.ts`) that is a no-op unless
the harness installs a sink, so no measured behaviour changes.

## Ranked — renders during one streamed turn

Two turn lengths were streamed to separate the cost that scales with chunks from the cost that
does not.

PRF2 stabilised every handler `App` passes to `AppSidebar`, so the `PRF2` columns come from the
same test run against `apps/app/src/lib/sidebar/use-sidebar-actions.ts`. PRF3 turned the React
Compiler on over both workspaces; the `PRF3` columns come from the same test again, and
`docs/perf/prf3-react-compiler.md` explains why not one of them moved.

| Rank | Unit | File / symbol | 11 chunks before | 11 chunks PRF2 | 11 chunks PRF3 | 22 chunks before | 22 chunks PRF2 | 22 chunks PRF3 | Scales with chunks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | app root | `apps/app/src/App.tsx` → `App` | 19 | 19 | 19 | 30 | 30 | 30 | yes, 1 render per chunk |
| 1 | sidebar body | `packages/ui/src/components/app-sidebar.tsx` → `AppSidebarBase` | 19 | 6 | 6 | 30 | 6 | 6 | before yes, after no |
| 3 | roster projection | `apps/app/src/App.tsx` → `rosterBots` | 6 | 6 | 6 | 6 | 6 | 6 | no |
| 3 | roster projection | `apps/app/src/App.tsx` → `rosterBotsBySpace` | 6 | 6 | 6 | 6 | 6 | 6 | no |
| 5 | streaming turn row | `apps/app/src/components/thread-turn.tsx` → `ThreadTurn` (streamed message) | 3 | 3 | 3 | 3 | 3 | 3 | no |
| 6 | settled turn row | `apps/app/src/components/thread-turn.tsx` → `ThreadTurn` (earlier message) | 2 | 2 | 2 | 2 | 2 | 2 | no |

Before PRF2, `AppSidebarBase` rendered exactly as many times as `App` — 19/19 and 30/30 — and the
`memo` boundary at `app-sidebar.tsx` → `const AppSidebar = memo(AppSidebarBase)` bailed out zero
times. After PRF2 it renders 6 times whatever the turn length, tracking the roster projections
instead of the chunks: the sidebar left the per-chunk render path.

## Ranked — SVG attribute writes over 60 animation frames

Measured rows are the first four; the last two are arithmetic on them.

| Rank | Unit | File / symbol | Roster idle | Roster idle PRF3 | One bot working | One bot working PRF3 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | attribute writes, 60 frames | `packages/ui/src/components/bot-avatar-engine.ts` → `render` | 0 | 0 | 1980 | 1980 |
| 2 | avatars moving | same | 0 | 0 | 3 | 3 |
| 3 | writes that wrote the value already there | same | 0 | 0 | 54 | 54 |
| 4 | frames that changed no rendered value | same | 0 | 0 | 0 | 0 |
| — | writes per frame (derived) | same | 0 | 0 | 33 | 33 |
| — | writes per avatar per frame (derived) | same | 0 | 0 | 11 | 11 |

## Document cost for a roster of three spaces

| Unit | File / symbol | Count |
| --- | --- | --- |
| `BotAvatar` instances | `packages/ui/src/components/bot-avatar.tsx` → `BotAvatar` | 6 |
| `<filter>` elements in the document | `bot-avatar.tsx:282` → per-instance `feTurbulence` filter | 6 |
| of which are avatar sketch filters | `filter[id^="bot-avatar-sketch-"]` | 6 |

One filter and one `feTurbulence` per mounted avatar, one avatar per bot, all six mounted at
once because `SpaceCarousel` renders every space's roster.

## Suspects

### Fixed by PRF2 — the `AppSidebar` memo boundary was defeated by inline handlers

`AppSidebarBase` rendered 19 times for 19 `App` renders, and 30 for 30. Not one bail-out.
`App.tsx` passed ~20 arrow functions built fresh in the JSX (`onCreateBot`, `onDeleteConversation`,
`onDuplicateBotToSpace`, `onOpenUserSettings`, …), so `memo`'s shallow compare failed on the first
one it reached, putting the whole roster subtree — including six `BotIdentityAvatar`s — on the
streaming render path.

`useSidebarActions` (`apps/app/src/lib/sidebar/use-sidebar-actions.ts`) now builds the whole
handler bundle once from the controllers, which are stable for the life of the app. The three
handlers that read changing state — `onCreateSection`, `onReorderSections`, `onOpenSpaceSettings`
— read it from `controller.getState()` at call time instead of closing over a render value, so
nothing forces them to be rebuilt. `AppSidebarBase` drops to 6 renders per turn at both lengths.

### Killed — `rosterBots` rebuilt on every chunk because `previews` carries the streamed text

`previews` does not carry streamed text. `lastWordIn`
(`apps/app/src/lib/conversations/transcript-state.ts`) uses
`messages.findLast(isTerminalCompletion)`, so it only ever reads a *settled* message; the
streaming one is skipped, and `previewSignatureOf` in `apps/app/src/lib/chat/use-chat.ts` keeps
the same object across chunks.

The counts agree: `rosterBots` and `rosterBotsBySpace` recomputed 6 times for an 11-chunk turn
and **6 times again** for a 22-chunk turn. They track turn lifecycle transitions
(`turnChanged`, `activity`, `turnEnded` — the `working` and `badges` inputs), not chunks.
Memoising them harder would buy nothing.

### Killed — the transcript re-rendering per chunk

The streamed row rendered **3** times for an 11-chunk turn and 3 times again for a 22-chunk
turn; a settled row rendered 2 times in both. The streamed text does not reach `ThreadTurn`
chunk by chunk, so the transcript is not on the per-chunk path — the sidebar is.

### Killed for an idle roster — the avatar engine writing SVG attributes every frame while settled

60 frames with the roster idle produced **0** attribute writes. Roster avatars mount with
`animated={working}` (`packages/ui/src/components/bot-identity-avatar.tsx`), so
`BotAvatar`'s layout effect calls `renderStatic()` and never calls `engine.start()`. No frame
listener, no writes. The 140 ms boil interval is off too: `applyBoil` gates on
`!PASSIVE.has(this.state)` and `PASSIVE` contains `waiting`, `sleeping`, `idle`, `bored`,
`drowsy` — every state an idle roster row can hold.

### Confirmed with a narrower scope — the settled gate does not cover the per-frame writes

While one bot is working, the engine writes 33 SVG attributes per frame across 3 mounted views
of that bot, 11 per avatar per frame, and **not a single frame of 60 was a no-op**.
`bot-avatar-engine.ts` → `render` gates only `renderHead`, `renderEyes` and `renderWire` behind
`!settled || this.eyesDirty || this.poseMoved()`. The `parts.rig` transform and `renderEars`
run unconditionally, and both are driven by `Math.sin(now * …)` (breath, ear sway), so their
value genuinely changes every frame and no epsilon gate can catch them as written. Only 54 of
1980 writes (2.7%) re-wrote the value already in the DOM.

## PRF4 — what one chat opening costs

Every figure below comes from `apps/app/src/lib/perf/chat-open-baseline.test.ts`, same harness
shape as PRF1: `createFakeChatDriver` + `createFakeTranscriptStore`, no desktop host, no source
module touched. The store is wrapped in a tracing proxy that records the ordered call names and
can hold every call by a fixed delay; commits come from a `<Profiler>` around the app; the first
painted transcript row is the first `ThreadTurn` probe carrying the chosen bot's anchor.

Scenario: one space, four bots, each main chat holding two stored messages, one bot chosen at
mount. An opening is a click on a roster row.

### Store calls awaited between the choice and the first painted row

| Opening | Store calls awaited, in order | Calls | Commits | Writes queued ahead of the read |
| --- | --- | --- | --- | --- |
| cold — bot never opened this session | `botSkills`, `botMcpServers`, `botHistory`, `mainChat`, `botCommands`, `loadPage` | 6 | 5 | 0 |
| warm — bot opened earlier, left, chosen again | *none* | 0 | 1 | 0 |
| contended — another bot streaming a reply | `botSkills`, `botMcpServers`, `botHistory`, `mainChat`, `botCommands`, `loadPage` | 6 | 5 | 0 |

Only two of the six are on the opening's own path and they are serial: `openConversation`
(`chat-controller.ts:650`) awaits `store.mainChat`, then awaits `enqueue(() =>
transcript.load(chat.id))`. `botSkills`, `botMcpServers` and `botHistory` are fired in parallel
by `App`'s selection effect, `botCommands` in parallel by `recallCommands`.

### Elapsed simulated time with one fixed 5 ms delay on every store call

| Opening | Elapsed to first painted row | Store calls awaited | Commits | Writes queued ahead |
| --- | --- | --- | --- | --- |
| cold | 10 ms | 6 | 8 | 0 |
| warm | 0 ms | 0 | 1 | 0 |
| contended | 11 ms | 9 (`appendUserMessage` and `captureCheckpoint` land inside the window) | 9 | 1 |

10 ms is exactly two store round-trips: the opening pays store latency twice, never more,
whatever the roster reads do around it.

### A page of twenty stored messages

Same harness, one bot seeded with 20 messages — 10 user, 10 assistant, each assistant carrying
one fenced `ts` code block.

The `PRF5` column comes from the same test run after the code highlighter moved off the paint
path. The `PRF6` column comes from the run after
`packages/ui/src/components/markdown/index.tsx` hoisted its static remark plugin list to a module
constant; the PRF6 section below explains why the processor count did not move and why that is
the floor.

| Unit | File / symbol | PRF4 | PRF5 | PRF6 |
| --- | --- | --- | --- | --- |
| markdown processors built | `packages/ui/src/components/markdown/index.tsx` → one per `Markdown` render | 30 | 30 | 30 |
| code highlighter tokenize calls | `code-highlight.ts` → `highlightCode` | 10 | 10 | 10 |
| code highlighter builds | `code-highlight.ts` → `createHighlighterCoreSync` | 1 per process, inferred | 1 per process, counted | 1 per process |
| code highlighter builds during the opening | `highlighterBuildCount()` around the open | not taken | 0 | not taken |
| blocked ms on the first painted fence | first `highlightCode` of the page | 85 ms | 0.3 ms | not taken |
| blocked ms off the paint path | `prepareHighlighter()`, 12 languages | none, the paint paid it | 377 ms | not taken |
| React commits before the first painted row | `<Profiler>` around `App` | 5 | 5 | 5 |
| React commits before the settled page | same | 11 | 11 | 11 |
| rows painted | `[data-slot="chat-turn-group"]` | 20 | 20 | 20 |

30 processors for 20 messages: one per markdown block, and each assistant message splits into
prose plus fence.

The PRF4 figure attributed the 85 ms to `createHighlighterCoreSync`. Measured apart, the
construction is 2.7 ms and the rest is the JavaScript regex engine compiling a grammar on its
first real tokenization — 122 ms for `typescript`, 44 ms for `bash` on this machine. So the
warm-up tokenizes a sample in every bundled language (`warmCodeLanguage`), the app schedules one
language per idle callback after the first paint (`apps/app/src/lib/warm-highlighter.ts`), and a
fence renders as plain text until its own language is warm. Compilation stays lazy per pattern:
a fence using constructs the sample never exercises still pays around 27 ms once.

## PRF4 suspects

### Held, and bounded — the shared write queue

The opening read is genuinely behind the queue: `openConversation` awaits `enqueue(() =>
transcript.load(chat.id))` on the same `createQueue()` tail every streamed `appendText` uses
(`chat-controller.ts:164`, `apps/app/src/lib/queue.ts`). Measured, it costs one store round-trip
per write already queued — **0** writes ahead when the store answers instantly, **1** when every
call is held 5 ms, for 1 extra ms of the contended opening's 11. The mechanism is real, the
amount is a multiple of real store latency times the backlog, not a second on its own.

### Killed for the switch-away path — the absent transcript cache

Choosing a bot opened earlier in the same session paints its first row in **1 commit, 0 store
calls, 0 ms**: `transcriptReducer` still holds the page for that conversation, so the row is on
screen before `mainChat` is even called and the refetch lands behind it. There is a cache; it is
just not named one.

### Held — the first paint of a twenty message page

The widest figures of the three: **30** markdown processors built and **10** synchronous
highlighter calls in the commits that carry the page, plus the one-time shiki build. The build
alone is **85 ms of blocking main-thread work** in this harness (first `highlightCode` call
against **0.007 ms** for the next), paid by whichever chat first paints a fenced code block. The
page then takes **11** commits to settle, 5 of them before the first row is on screen.

### Gaps — figures not taken

- **The shiki build count was inferred, not counted** — closed in PRF5. `code-highlight.ts` now
  counts its own constructions and `highlighterBuildCount()` reads them from the harness: one
  build per process, none during a chat opening.
- **A real close is not reachable.** `chat.controller.close` is only called by `App` when a bot
  is deleted, so "opened and closed earlier, then chosen again" is measured as "opened, left,
  chosen again". A deleted bot cannot be re-opened.
- **Elapsed time is simulated.** The delay figures are one fixed 5 ms per store call under fake
  timers. Real SQLite and Tauri IPC latency is out of this harness; the useful reading is the
  *number* of serial round-trips (2), not the milliseconds.
- **Commits are counted with `<Profiler>`**, so they are commits in which the app subtree
  rendered, not every commit React performed.

## PRF6 — the markdown processor rebuild

### Killed — plugin array identity was never what rebuilt the processor

The premise was that `react-markdown` memoises its `unified` processor on the identity of
`remarkPlugins` / `rehypePlugins`. It does not. In `react-markdown@10`, the synchronous
`Markdown` component calls `createProcessor(options)` in its render body on **every** render,
with no cache and no dependency check (`react-markdown/lib/index.js:176`). Only `MarkdownHooks`
keys anything on plugin identity, and that is a `useEffect` dependency list, not a processor
cache. Stabilising the arrays therefore buys zero rebuilds.

### Killed — the re-render rebuild

Measured directly in `packages/ui/src/components/markdown/processor-reuse.test.tsx`, which mocks
`react-markdown`'s default export to count one processor per `ReactMarkdown` render: mounting one
block, re-rendering it with identical props, then re-rendering it again with a **different**
`className` builds **1** processor in total. PRF3's React Compiler already memoises the
`<ReactMarkdown>` element on `children` and the `useId` scope, so a mounted block that re-renders
with the same text rebuilds nothing. The test now holds that as a contract instead of an
accident, alongside a second case fixing one processor per block for a page of 20 blocks.

### Killed on cost — the build is 1% of the run

Timed over 500 iterations each, against the real plugin list:

| Unit | File / symbol | Per call |
| --- | --- | --- |
| build the processor | `unified().use(…)` over the markdown plugin list | 0.0018 ms |
| run it | `processor.runSync(processor.parse(file), file)` | 0.1652 ms |
| mount one `Markdown` block | `packages/ui/src/components/markdown/index.tsx` → `Markdown` | ~1.1 ms |

Building the processor is **1.1%** of running it and **0.16%** of mounting a block. The 30 builds
on a full page cost **0.054 ms** in total. Sharing one frozen processor across blocks would take
30 down to 1 and save that 0.054 ms — at the price of dropping `react-markdown`'s component and
re-implementing its `post()` step (`unified`, `remark-parse`, `remark-rehype`, `vfile`,
`hast-util-to-jsx-runtime`, `unist-util-visit`, `html-url-attributes`, plus its default
`urlTransform`), none of which resolve from `packages/ui` today. Not worth it against 0.054 ms.

### What changed

`packages/ui/src/components/markdown/index.tsx` hoists the four remark plugins to a module
constant. It is an allocation the compiler was already memoising, so no count moved. The rehype
list stays inline: it carries the `rehypeScopeIds` entry holding the per-block `useId`, so it is
rebuilt every render whatever is done to its other entry.

### Gap — processors are counted through `react-markdown`'s render, not its internals

`createProcessor` is module-private, so both the PRF4 harness and the PRF6 test count renders of
the component that calls it. The two are equal only because `createProcessor` is unconditional in
the render body — a `react-markdown` upgrade that adds a cache would silently break the equality.

## Out of scope, not measured

SQLite write path, the Tauri event bus, and anything needing the packaged app.

## Reproducing

```
cd apps/app && bun run test:unit
```

The three PRF1 cases live in `apps/app/src/lib/perf/render-baseline.test.ts` and the four PRF4
cases in `apps/app/src/lib/perf/chat-open-baseline.test.ts`. Both hold their counts in inline
snapshots, so a regression or an improvement shows up as a snapshot diff.

The PRF6 processor counts are held in `packages/ui/src/components/markdown/processor-reuse.test.tsx`:

```
cd packages/ui && bun run test
```

## PRF7 — what one transcript page costs on the store path

PRF4 priced a store round trip at a simulated 5 ms. This section replaces that placeholder with
the real one. Every figure comes from `apps/app/src-tauri/tests/store_open_cost.rs`, run against
the production `db::bootstrap` — the real `connection::open` (WAL, `busy_timeout` 5 s, no
`synchronous`), the real migrations, the real `MessagesRepository::page_messages`, the real
`conversation_message_page` command behind the real `invoke_handler`, the real
`Arc<Mutex<Connection>>` every command shares. No pragma and no production line was changed.

Scenario: 40 conversations of 500 messages each — 20 000 rows — each row carrying a ~190 character
body. One first page is `before_seq: None, limit: 20`, the same shape `TRANSCRIPT_PAGE_SIZE` asks
for. 100 reads per series, 50 commits per series. One `Database`, managed by the app, serves the
repository reads, the IPC command and the contending writer alike, so the mutex they fight over is
the same one.

Four paths are timed for the same page:

- **through the repository** — `database.messages().page_messages(…)`, what a command's body costs.
- **probed** — the same query issued through `Database::call`, with a second clock started once
  the closure is running. Everything before it — the `spawn_blocking` dispatch and the mutex — is
  `waiting on the connection`; the rest is `query, inside the lock`. The probe asserts it returns
  the same twenty ids the repository returned.
- **over ipc** — `get_ipc_response` on `conversation_message_page`: argument deserialisation,
  command dispatch, the repository read, `TranscriptPage::of`, and serialisation of the response.
  It asserts the same twenty ids again.

Machine: M-series macOS, APFS, `cargo test` debug profile (unoptimised). The tables record one
run. Absolute values move by up to 2x with machine load — a busy run read 0.105 ms through the
repository and 0.507 ms over IPC — while the ratios between the paths hold. The ratios are the
finding, not the microseconds.

### One first page read

| Series | median | p95 |
| --- | --- | --- |
| first read, untouched page cache | 0.206 ms | — |
| idle — whole read, through the repository | 0.047 ms | 0.057 ms |
| idle — whole read, probed | 0.035 ms | 0.048 ms |
| idle — waiting on the connection | 0.008 ms | 0.016 ms |
| idle — query, inside the lock | 0.027 ms | 0.035 ms |
| **idle — whole read, over ipc** | **0.255 ms** | **0.282 ms** |
| contended — whole read, through the repository | 0.145 ms | 0.191 ms |
| contended — whole read, probed | 0.128 ms | 0.176 ms |
| contended — waiting on the connection | 0.097 ms | 0.145 ms |
| contended — query, inside the lock | 0.029 ms | 0.034 ms |
| **contended — whole read, over ipc** | **0.297 ms** | **0.347 ms** |

Contended means a second task committing user messages in a loop through the same `Database`;
it landed 598 commits inside the read window, so every read queued behind several writes.

The query is flat: **0.027 ms idle, 0.029 ms contended**. `messages` carries
`UNIQUE (conversation_id, seq)`, so `WHERE conversation_id = ?1 AND seq < ?2 ORDER BY seq DESC
LIMIT 21` walks that index backwards and stops after 21 rows — 500 rows in the conversation or
20 000 in the file makes no difference to it.

Everything contention adds lands on the wait, which goes from 0.008 ms to 0.097 ms — a **12×**
rise that takes the repository read from 0.047 ms to 0.145 ms. The 0.097 ms the reader waits is
the same order as the 0.088 ms one commit takes, which is the mechanism stated plainly: a read
arriving mid-commit waits out that commit, because both hold the one `Mutex<Connection>`.

### The command layer costs more than the store it wraps

| | idle | contended |
| --- | --- | --- |
| through the repository | 0.047 ms | 0.145 ms |
| over ipc | 0.255 ms | 0.297 ms |
| **the command layer adds** | **0.208 ms** | **0.152 ms** |
| serialised response | 9 242 bytes | 9 242 bytes |

The IPC read is **5.4× the repository read when idle**. The gap is not the store: it is argument
deserialisation, command dispatch, mapping twenty `StoredMessage` into twenty `TranscriptMessage`,
and serialising 9 242 bytes of JSON — 462 bytes per row, tracking the ~190 character body plus
eleven fields of envelope. That gap is *flat under contention* while the repository read triples,
so the two costs are independent: contention is paid on the mutex, serialisation is paid on the
CPU, and the contended IPC read is barely worse than the idle one because the fixed cost dominates.

This inverts the intuition the section started from. Of a 0.297 ms contended page read, the
mutex wait is 0.097 ms and the query is 0.029 ms — **the store is 42 % of it, and the command
envelope is the rest.**

### What is not measured

`get_ipc_response` calls the command handler directly. It does **not** cross the webview
transport: no `postMessage`, no JSON parse on the JavaScript side, no serde round trip through
the OS webview's IPC bridge, no scheduling against the renderer's event loop. So the 9 242 bytes
are measured as produced, not as delivered.

**The unknown is the transport for a ~9 KB payload, twice per opening.** Nothing here bounds it.
It is the one remaining term between this section's numbers and the real cost PRF4 counted; if a
future ticket needs the true figure, it has to be taken from a running webview, not from this
harness.

### `synchronous`, and what leaving it at the default costs

`connection.rs:35` sets `journal_mode = WAL` and never sets `synchronous`, so the effective value
is SQLite's default: **FULL (2)**.

| One `append_user_message` commit | median | p95 |
| --- | --- | --- |
| `synchronous=FULL` (production today) | 0.088 ms | 0.104 ms |
| `synchronous=NORMAL` | 0.071 ms | 0.106 ms |

The gap is 0.017 ms per commit and it does not survive repeated runs — across seven runs FULL
landed between 0.088 and 0.230 ms and NORMAL between 0.070 and 0.173 ms, crossing over once.
On macOS SQLite's `fsync()` is not `F_FULLFSYNC` unless asked, so WAL+FULL is not paying for a
device barrier here. **Lowering `synchronous` to NORMAL would buy nothing measurable on this
machine and would trade away durability on a power loss.** It is not the cost.

### Do two serial round trips account for the second a reader waits?

**No. Not within two orders of magnitude — even counting the command layer.**

PRF4 established that a cold opening awaits exactly two serial store calls on its own path —
`store.mainChat`, then `enqueue(() => transcript.load(chat.id))`. Priced with the real numbers:

| two serial round trips | idle | contended |
| --- | --- | --- |
| through the repository | 0.093 ms | 0.290 ms |
| over ipc | 0.509 ms | 0.593 ms |

0.593 ms is **0.06 %** of one second, and the worst run measured put it at 1.49 ms — still
**0.15 %**. Measuring the command layer moved the figure by 5x, from 0.09 ms to 0.51 ms, and it
is still nearly three orders of magnitude short of a second. The verdict
stands, with its scope now stated: **through the command layer, the store is not the suspect.**
PRF5 already located the second — 85 ms blocked on the first fence's grammar compilation on the
paint path.

The one honest caveat is above: the webview transport is not in these numbers. It would have to
cost 500× the entire measured round trip to become the explanation.

The PRF7 numbers are held in `apps/app/src-tauri/tests/store_open_cost.rs`:

```
cd apps/app/src-tauri && cargo test --features fake-claude --test store_open_cost -- --nocapture
```
