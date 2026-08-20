# OpenNest

OpenNest is a desktop app for Claude Code: a roster of bots you name, dress and brief — each with its own model, working directory and persistent conversation — all answered by the Claude Code agent OpenNest ships with.

Every bot holds its own session in the bundled agent, so one can be working while you read another, and every conversation is stored locally and comes back on the next launch.

## Requirements

- **A [Claude](https://claude.com/claude-code) subscription, signed in.** OpenNest bundles the agent that answers — nothing to install — but it answers on your own sign-in.
- **No API key.** OpenNest never reads one, never asks for one and never talks to an API itself. Your Claude sign-in is the only credential involved.
- [Bun](https://bun.sh) — runtime and package manager.
- [Rust toolchain](https://rustup.rs) — the Tauri host is Rust.
- On Linux, the [Tauri system dependencies](https://tauri.app/start/prerequisites/#linux).

macOS, Linux and Windows.

## Getting started

```bash
bun install
bun run dev
```

`bun run dev` launches the Tauri app locally: Vite dev server plus the native window, with hot reload.

## Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Launch the Tauri app — Vite dev server + native window, hot reload. |
| `bun run storybook` | Storybook on <http://localhost:6006> — the place to build UI. |
| `bun run test` | Vitest (unit + Storybook) and `cargo test` for the Tauri host. |
| `bun run lint` | Biome check. |
| `bun run lint:fix` | Biome check with fixes applied. |
| `bun run types` | Type check across the workspaces (`tsc -b`). |
| `bun run build` | Build every workspace. |
| `bun run tauri:build` | Package the desktop app. |

The Storybook half of `bun run test` runs in headless Chromium — install that browser once with `bunx playwright install chromium` from `packages/ui`.

## Environment

| Variable | Read by | What it does |
| --- | --- | --- |
| `OPENNEST_AGENT_SIDECAR` | the app, whenever it resolves the agent | Absolute path to an `opennest-agent` executable. It is tried **before** the copy bundled beside the app and the one left in the build tree, so it wins over the sidecar the app ships with. Leave it unset to run that one. |
| `APPLE_SIGNING_IDENTITY` | `bun run tauri:build` | Developer ID to sign the macOS bundle with. Unset, the build ad-hoc signs instead. Tauri reads it directly and enables the hardened runtime on its own. |

`OPENNEST_AGENT_SIDECAR` is what the host test suites point at a fake sidecar. A leftover export silently sends the app at that fake too, so `unset OPENNEST_AGENT_SIDECAR` before running against the bundled sidecar.

Neither variable belongs in the repository: one is a local path, the other a personal certificate name.

## Monorepo

| Workspace | Path | Purpose |
| --- | --- | --- |
| `app` | `apps/app` | The desktop application — technical composition only. Tauri + React + Vite. |
| `@workspace/ui` | `packages/ui` | Every visual: components, foundations, tokens. React + Storybook + Tailwind + Base UI. |

The boundary between the two is absolute — no markup, no Tailwind class and no raw DOM element lives in `apps/app`. That rule and the rest of the conventions are in [`AGENTS.md`](AGENTS.md), which every contributor and every AI agent working here must follow.

The protocol OpenNest speaks to Claude Code — the frames, the permission handshake, session resume — is documented in [`apps/app/src-tauri/src/agent/PROTOCOL.md`](apps/app/src-tauri/src/agent/PROTOCOL.md), measured against the running sidecar rather than taken from the docs.

## Releasing

```bash
bun run tauri:build
```

To sign with a Developer ID rather than ad-hoc, put the identity in the environment:

```bash
APPLE_SIGNING_IDENTITY="Developer ID Application: …" bun run tauri:build
```

Signing is not notarization: a signed bundle is still refused by Gatekeeper until it has been submitted to Apple and stapled, which is a separate step.

Before tagging a release, walk [`apps/app/SMOKE.md`](apps/app/SMOKE.md) — the manual checks against the bundled sidecar and a real sign-in that the automated suite cannot reach.

## License

MIT — see [`LICENSE`](LICENSE).
