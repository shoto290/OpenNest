# PRF3 — React Compiler

`babel-plugin-react-compiler@1.0.0` now runs over every `.ts` and `.tsx` file of `apps/app/src`
and `packages/ui/src`, in the dev server, the production build, and both vitest projects.

## Where it is wired

| Pipeline | File | Note |
| --- | --- | --- |
| dev server + `vite build` | `apps/app/vite.config.ts` | `packages/ui/src` is compiled through the `@workspace/ui` alias, so the app build covers both workspaces |
| `apps/app` vitest | `apps/app/vitest.config.ts` | takes `.preset` |
| `packages/ui` vitest, project `unit` | `packages/ui/vitest.config.ts` | takes `.preset` |
| `packages/ui` vitest, project `storybook` + `storybook dev` / `build-storybook` | `packages/ui/.storybook/main.ts` | browser environment, whole preset |

`reactCompilerPreset()` from `@vitejs/plugin-react` returns the babel preset wrapped in rolldown
filters, one of which is `applyToEnvironmentHook: (env) => env.config.consumer === "client"`.
Vitest transforms modules in a server environment, so the wrapped preset is silently skipped and
the tests measure uncompiled code. The two vitest configs pass `reactCompilerPreset().preset`, the
bare babel preset with no filters, which compiles in every environment. The client builds keep the
whole preset for its `optimizeDeps` entry.

`@babel/core` is pinned to `^7.29.0`. On `@babel/core@8`, `AssignmentPattern` was removed from the
`LVal` alias, and `babel-plugin-react-compiler@1.0.0` calls `path.isLVal()` on every object-pattern
property value: every destructured parameter with a default (`{ isSettingsOpen = false }`) fails
with `(BuildHIR::lowerAssignment) Expected object property value to be an LVal, got:
AssignmentPattern`. That silently declined 45 of our files. Babel 7 compiles them.

## Bail-outs

The compiler declines these 15 symbols across 11 files. Everything else compiles: the production
bundle carries 134 `react.memo_cache_sentinel` sites and the babel transform runs on 275 modules.

| File | Symbol | Category | Compiler's reason |
| --- | --- | --- | --- |
| `apps/app/src/App.tsx` | `App` | UseMemo | Expected the first argument to be an inline function expression |
| `packages/ui/src/components/app-sidebar.tsx` | `BotRoster` | Refs | Cannot access refs during render |
| `packages/ui/src/components/app-sidebar.tsx` | `SpaceCarousel` | Refs | Cannot access refs during render |
| `packages/ui/src/components/message-bubble.tsx` | `MessageBubbleContent` | Refs | Cannot access refs during render |
| `packages/ui/src/components/message-scroller.tsx` | `MessageScroller` | Immutability | This value cannot be modified |
| `packages/ui/src/components/motion/animated-sidebar.tsx` | `AnimatedSidebarProvider` | Refs | Cannot access refs during render |
| `packages/ui/src/components/motion/animated-sidebar.tsx` | `AnimatedSidebarTrigger` | Immutability | This value cannot be modified |
| `packages/ui/src/components/motion/context-menu.tsx` | `ContextMenuTrigger` | Immutability | This value cannot be modified |
| `packages/ui/src/components/motion/context-menu.tsx` | `ContextMenuContent` | Immutability | This value cannot be modified |
| `packages/ui/src/components/motion/context-menu.tsx` | `ContextMenuSubContent` | Refs | Cannot access refs during render |
| `packages/ui/src/components/motion/tooltip.tsx` | `Tooltip` | Refs | Cannot access refs during render |
| `packages/ui/src/components/markdown/math.tsx` | `MarkdownMath` | Todo | (BuildHIR::lowerExpression) Handle Import expressions |
| `packages/ui/src/components/markdown/mermaid.tsx` | `MarkdownMermaid` | Todo | (BuildHIR::lowerExpression) Handle Import expressions |
| `packages/ui/src/components/progress-grid.tsx` | `ProgressGrid` | Todo | (BuildHIR::lowerExpression) Handle ??= operators in AssignmentExpression |
| `packages/ui/src/hooks/use-space-shortcut.ts` | `useSpaceShortcut` | Refs | Cannot access refs during render |

Four groups, and only the first is a genuine Rules-of-React violation:

- **UseMemo** — `App` passes `useMemo(createChatDriver, [])` and
  `useMemo(createTranscriptStore, [])` a function reference instead of an inline callback. Left as
  written: PRF3 does not touch the memoisation that predates the branch.
- **Refs** — a `ref.current` read or write reached during render. `BotRoster` reads
  `botLift.lift?.id` from `useRosterLift`, the menu and tooltip components assign
  `context.triggerRef.current` from inside a `ref` callback built in the render body, and
  `useSpaceShortcut` writes `reach.current = onRank` at the top level of the hook. Legal today
  because the writes are re-run on every render on purpose, but the compiler cannot prove it.
- **Immutability** — the same shape seen from the other side: a caller-owned ref or prop object is
  mutated (`externalViewportRef.current = node`).
- **Todo** — unimplemented compiler syntax, not our code: dynamic `import()` in `MarkdownMath` and
  `MarkdownMermaid`, and `??=` in `ProgressGrid`.

## Effect on the PRF1 counters

None. Every count in `docs/perf/prf1-baseline.md` is identical after PRF3 — renders at 11 and 22
chunks, and the 60-frame SVG write tally — so the three inline snapshots in
`apps/app/src/lib/perf/render-baseline.test.ts` were left untouched and no counter rose above its
PRF2 value.

That is the expected result, not a null one. The two components that sit on the streaming render
path are `App` and `AppSidebarBase`. `App` declines to compile (see above), so nothing about its
19/30 renders could change. `AppSidebarBase` does compile, but PRF2 already stabilised every
handler it receives, so it was already off the per-chunk path at 6 renders and the compiler had
nothing left to take. The remaining counters (`rosterBots`, `rosterBotsBySpace`, `ThreadTurn`)
track turn-lifecycle transitions, and the compiler memoises values, not effects — it cannot remove
a render caused by a state change.

The probe still fires once per render: `probeRender("App")` is a call to an imported function with
no return value, so the compiler leaves it on the render path rather than caching it.

## Cost

`bun run build` in `apps/app` spends 4.8s of a 6.2s build inside `@rolldown/plugin-babel` over 275
modules. `bun run test:unit` in `apps/app` goes from ~9s to ~14s.

## Reproducing the bail-out list

```
cd apps/app && bun run build
```

The compiler reports declines through its `logger.logEvent` hook, not through the build log. To
list them, run `babel.transformAsync` over `apps/app/src/**/*.{ts,tsx}` and
`packages/ui/src/**/*.{ts,tsx}` with `plugins: [["babel-plugin-react-compiler", { logger }]]` and
collect every event whose `kind` is not `CompileSuccess`.
