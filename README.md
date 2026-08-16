# opennest

Tauri desktop app (macOS and Linux for now) in a Vite monorepo with shadcn/ui.

## Development

```bash
bun install
bun run dev
```

`bun run dev` launches the Tauri app locally (Vite dev server + native window with hot reload).

Requirements: [Bun](https://bun.sh) and the [Rust toolchain](https://rustup.rs). On Linux, install the [Tauri system dependencies](https://tauri.app/start/prerequisites/#linux).

## Building

```bash
bun run tauri:build
```

Before tagging a release, walk [`apps/app/SMOKE.md`](apps/app/SMOKE.md) — the manual checks against a real Claude Code that the automated suite cannot reach.

## Adding components

To add components to your app, run the following command at the root of your `app` app:

```bash
bunx --bun shadcn@latest add button -c apps/app
```

This will place the ui components in the `packages/ui/src/components` directory.

## Using components

To use the components in your app, import them from the `ui` package.

```tsx
import { Button } from "@workspace/ui/components/button";
```
