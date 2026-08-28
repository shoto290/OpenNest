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

## Out of scope, not measured

SQLite write path, the Tauri event bus, and anything needing the packaged app.

## Reproducing

```
cd apps/app && bun run test:unit
```

The three cases live in `apps/app/src/lib/perf/render-baseline.test.ts` and hold their counts in
inline snapshots, so a regression or an improvement shows up as a snapshot diff.
