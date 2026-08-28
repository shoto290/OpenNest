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

The `PRF6` column comes from the same test run after
`packages/ui/src/components/markdown/index.tsx` hoisted its static remark plugin list to a module
constant; the PRF6 section below explains why the processor count did not move and why that is
the floor.

| Unit | File / symbol | Count | PRF6 |
| --- | --- | --- | --- |
| markdown processors built | `packages/ui/src/components/markdown/index.tsx` → one per `Markdown` render | 30 | 30 |
| code highlighter tokenize calls | `packages/ui/src/lib/code-highlight.ts:119` → `highlightCode` | 10 | 10 |
| code highlighter builds | `code-highlight.ts:85` → `createHighlighterCoreSync` | 1 per process, see gap below | 1 per process |
| React commits before the first painted row | `<Profiler>` around `App` | 5 | 5 |
| React commits before the settled page | same | 11 | 11 |
| rows painted | `[data-slot="chat-turn-group"]` | 20 | 20 |

30 processors for 20 messages: one per markdown block, and each assistant message splits into
prose plus fence.

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

- **The shiki build count is inferred, not counted.** `shiki/core` does not resolve from
  `apps/app`, so it cannot be mocked from the harness, and counting the build from inside
  `code-highlight.ts` would change a measured module. What is measured instead is the first
  `highlightCode` call against the next: 85 ms vs 0.007 ms, one memoized build per process.
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
