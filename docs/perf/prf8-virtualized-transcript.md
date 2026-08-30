# PRF8 — Virtualized transcript

`MessageScroller` no longer renders the transcript it is given. It renders `rows`, one entry per
run, through a `@tanstack/react-virtual` virtualizer in chat mode (`anchorTo: "end"`), so only the
runs intersecting the viewport plus three rows of overscan are ever mounted. `ThreadLayout` passes
the rows straight through, and `thread-screen.tsx` maps `runs: TranscriptRow[][]` to them with
`toRunRows`, keyed by `bubbleIdOf(run[0].messageId, run[0].blockIndex)` — never by index.

Everything passed as `children` still renders under the rows and stays mounted: that is the
working indicator, the queued turns and the empty state, which must be visible at the live edge.

## What the open costs

Both columns come from the same test body — seed a bot with 500 stored messages, page size 500,
click its roster row, wait for the first `ThreadTurn` probe, then settle. `before` was measured on
`main` with the run list rendered as children.

| Counter | Before | After |
| --- | --- | --- |
| React commits from click to settled | 10 | 11 |
| Runs mounted after the open | 500 | 8 |
| Test body wall time (happy-dom) | 2979 ms | 63 ms |

The commit count is the wrong number to chase here and it barely moves: an open has always taken
about ten commits. What changed is what each commit walks. 500 `TurnGroup` subtrees became 8, and
the same harness that took three seconds to mount them takes 63 ms.

The PRF5 page-of-twenty counters move for the same reason — with a 600 px viewport only 8 of the
20 runs are mounted, so two thirds of the markdown and highlighter work never happens on open:

| `chat-open-baseline` counter | Before | After |
| --- | --- | --- |
| `paintedRows` | 20 | 8 |
| `markdownProcessors` | 30 | 12 |
| `highlightCalls` | 10 | 4 |
| `commitsToSettled` | 11 | 11 |

## Who owns the scroll

The chat-mode options replace most of the hand-rolled scroll code that used to live in
`message-scroller.tsx`:

| Behaviour | Owner |
| --- | --- |
| Prepend pin — older page above the reader's row | `anchorTo: "end"`, which re-anchors on the row under the current offset |
| Streaming growth at the live edge | virtual-core's at-end measurement adjustment, gated by `scrollEndThreshold: followThreshold` |
| Row measurement and positions | `measureElement` + `directDomUpdates`, which writes the container height inside the measurement pass instead of waiting for a React commit |
| Jump to an unmounted run | `scrollToIndex(index, { align: "center" })`, then the exact `[data-message-id]` anchor once the row is mounted |
| Landing on the newest run, follow state, jump-to-latest button | the component |

`followOnAppend` stays off and the landing scrolls the viewport to its real bottom instead. The
library's own end scroll aligns the *last row* with the viewport bottom, which would push the
working indicator and the queued turns — they live under the rows, outside the virtual list —
below the fold on every appended run.

The component keeps three small pieces for the same reason:

- a layout effect that lands on the live edge when the row count or the transcript key changes;
- a `ResizeObserver` on the viewport and on the trailing block, for a growing composer or a
  working indicator appearing, neither of which the virtualizer can see;
- an `onChange` hold, one corrective scroll per frame, that answers the pixels the library's
  at-end adjustment cannot recover once the browser has clamped the scroll offset.

## Known noise

Chrome logs `ResizeObserver loop completed with undelivered notifications` about eight times over
a full run of `message-scroller.stories.tsx`. It is the browser reporting that a resize callback
dirtied layout again — here, the virtualizer writing a measured row's height and the hold that
follows it. It is benign and self-correcting; the one-scroll-per-frame latch on the hold took it
from twenty-one occurrences to eight and the story suite from flaky to green over ten consecutive
runs. Removing it entirely would mean giving up either the measurement pass or the hold.

The happy-dom perf tests also print `flushSync was called from inside a lifecycle method`: there,
scroll events are dispatched synchronously, so the virtualizer's notify lands inside a React
lifecycle. Browsers dispatch scroll asynchronously and the warning does not appear in Storybook.

## Reproducing

```
cd apps/app && bunx vitest run src/lib/perf
cd packages/ui && bunx vitest run --project=storybook src/components/message-scroller.stories.tsx
```

`apps/app/src/lib/perf/fake-layout.ts` is what makes the first one meaningful. happy-dom runs no
layout, so every box is zero tall and a virtualizer renders nothing at all; the helper stubs
`offsetHeight`, `offsetWidth` and `getBoundingClientRect` to give the viewport 600 px and each row
120 px. Both perf tests install it, which is why `paintedRows` reads 8 rather than 20.
