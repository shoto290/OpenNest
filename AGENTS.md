# AGENTS.md — Single Source of Truth

All AI agents working in this monorepo must follow these instructions.

## SIMPLE — Core Principles (Absolute Priority)

Every decision must pass through these six principles:

- **S — Simple** — Favor the simplest solution that solves the problem. Less code, fewer abstractions, no over-engineering.
- **I — Intentional** — Every line of code exists for a reason. No speculative features, no "just in case" logic.
- **M — Measurable** — Changes must have observable impact. If you can't verify it works, rethink the approach.
- **P — Pragmatic** — Ship what works today. Perfect is the enemy of done. Choose proven patterns over clever ones.
- **L — Layered** — Build incrementally. Each change should be a stable, shippable layer on top of what exists.
- **E — Envisioned** — Keep the end goal in sight. Short-term decisions should align with the long-term product vision.

## Behavioral Guidelines

Four rules that govern HOW you work. SIMPLE defines WHAT to build; these define how to approach the task.

### 1. Think Before Coding

- State assumptions explicitly. If uncertain, ask rather than guess.
- If multiple interpretations exist, present them — never pick silently.
- If a simpler approach exists, say so. Push back when warranted.

### 2. Simplicity First

- No features beyond what was asked. No abstractions for single-use code.
- No "flexibility" that wasn't requested. No error handling for impossible scenarios.
- Self-check: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

- Touch only what you must. Match existing style, even if you'd do it differently.
- Don't refactor things that aren't broken. If you notice unrelated dead code, mention it — don't delete it.
- Every changed line should trace directly to the request.

### 4. Goal-Driven Execution

- Define success criteria up front, then loop until verified.
- For multi-step tasks, state a brief plan with a verification step for each.

## UI / App Boundary (Absolute Rule)

**No visual code in `apps/app`. Every visual belongs to `packages/ui`.** No exception.

### The test

The moment you are about to write a `<div>` — or *any* raw HTML element, or *any* Tailwind class, or *any* markup that is not already a `@workspace/ui` component — stop. That code belongs in `packages/ui`. Build the component there, give it a story, then consume it from the app.

### `packages/ui` owns

- Every raw DOM element: `div`, `span`, `p`, `button`, `input`, `svg`, `ul`…
- Every Tailwind class, `cva` variant, inline style, CSS file, design token.
- Layout, spacing, color, typography, icons, animation, transitions.
- Visual state: hover, focus, loading skeletons, empty states, error banners.
- A Storybook story per component — a component without a story is not done.

### `apps/app` owns

Only **technical composition** — it places things, it does not draw them:

- Assembling `@workspace/ui` components into a screen.
- State, controllers, state machines, hooks, data flow.
- Tauri IPC, drivers, transports, parsing, business logic.
- Mapping domain models to component props (`toActivityItems`, `statusFor`…).
- Routing, providers, wiring, event handlers.

### Consequences

- An app file imports visuals **only** from `@workspace/ui/components/*`.
- Needs a wrapper, a grid, a stack, a gap? That is a `packages/ui` layout component (`ChatLayout`, `AppHeader`…), not a `div` in the app.
- Needs a one-off tweak? Add a variant or a prop to the UI component — never a Tailwind class in the app.
- A component in the app that is not pure composition of UI components is a bug: move it to `packages/ui`.
- Reference: `apps/app/src/components/chat-screen.tsx` — composition only, zero markup.

## House Rules

- **No new dependencies without approval** — Ask before adding any package.
- **Shared deps live in the root `package.json`** — Sub-package `package.json` only for truly package-specific deps. Check root first; duplicate versions cause type conflicts.
- **English only** — All code, comments, and identifiers in English.
- **Self-documenting code over comments** — Comments are the exception, not the default. Only for a non-obvious "why".
- **Named exports only** — No default exports (except Storybook stories).
- **Files in kebab-case** — `chat-screen.tsx`, not `ChatScreen.tsx`.
- **Check before creating** — Search `packages/ui/src/components` for an existing component before adding a new one.
- **One concern per commit** — Conventional Commits.
- **Avoid `useEffect`** — Use only when genuinely necessary.

## Monorepo

| Workspace | Path | Purpose | Stack |
|-----------|------|---------|-------|
| `app` | `apps/app` | Desktop application — technical composition only | Tauri + React + Vite |
| `@workspace/ui` | `packages/ui` | Every visual: components, foundations, tokens | React + Storybook + Tailwind + Base UI |

## Stack

- Runtime / package manager: Bun
- Monorepo: Turborepo
- Lint / format: Biome
- Frontend: React 19, Tailwind v4, Motion
- Desktop: Tauri (Rust)
- UI development: Storybook
- Tests: Vitest (+ `cargo test` for the Tauri host)

## Commands

```bash
bun run dev          # Launch the Tauri app (Vite + native window)
bun run storybook    # Storybook on :6006 — the place to build UI
bun run build        # Build all
bun run tauri:build  # Package the desktop app
bun run test         # Vitest + cargo test
bun run lint         # Check
bun run lint:fix     # Fix
bun run types        # Type check (tsc -b)
```

## Naming

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `chat-screen.tsx` |
| Components | PascalCase | `ChatScreen` |
| Functions | camelCase | `createChatDriver` |
| Constants | SCREAMING_SNAKE | `MAX_RETRIES` |
| Booleans | is/has/can prefix | `isLoading` |

## Code Style

- **Arrow functions only** — never the `function` keyword.
- **Named types for object params** — never inline `{ x }: { x: string }`; extract a named type.
- **Direct imports** — never barrel files. `@workspace/ui/components/button`, not `@workspace/ui`.

## Safety

### Destructive operations — NEVER without confirmation

Force push, hard reset, `git clean -fd`, branch delete (`-D`), `rm -rf` on a directory.

### Protected files

- **Never read/modify:** `.env`, `.env.*`, `secrets/`, `*.pem`, `*.key`, `*.cert`.
- **Confirm before modifying:** `package.json`, `biome.json`, `tsconfig*.json`, `turbo.json`, `src-tauri/tauri*.conf.json`, `.github/workflows/`.

### Branch protection

Never push to `main`. Always work on feature branches.
