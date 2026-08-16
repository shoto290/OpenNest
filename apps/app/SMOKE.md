# Smoke checklist — real Claude Code

Run before tagging a release. Every step here exercises something the automated
suite cannot reach: a signed-in binary, the network, a packaged bundle, or the
macOS quit sequence.

## Preconditions

- A real `claude` on `PATH`, signed in. Check with `claude --version`.
- `unset OPENNEST_CLAUDE_BIN`. A leftover export from an E2E session silently
  points the live tests and the app at the fake binary, and everything below
  passes against a stub that never talks to the network.
- Quit any running `bun run dev` first. `tauri.dev.conf.json` overrides only
  `bundle.icon`, so the identifier, the single-instance lock and the data
  directory are shared with the packaged app — the two builds fight over both.
- Store path: `~/Library/Application Support/com.opennest.app/session.json`.

## Signing

`bun run tauri:build` on its own ad-hoc signs the bundle. To sign it with the
Developer ID, put the identity in the environment:

```
APPLE_SIGNING_IDENTITY="Developer ID Application: Steve Puget (BBE5V2JL5H)" bun run tauri:build
```

The identity stays out of the committed config on purpose: a personal
certificate name is not shared property. Tauri reads `APPLE_SIGNING_IDENTITY`
and enables the hardened runtime on its own — no entitlements file and no
`bundle.macOS` config are needed. Confirm both:

```
APP=apps/app/src-tauri/target/release/bundle/macos/OpenNest.app
codesign --verify --deep --strict --verbose=4 "$APP"
codesign -d --verbose=4 "$APP" 2>&1 | grep -E "flags|Authority"
```

→ `valid on disk`, `flags=0x10000(runtime)`, and an `Authority` chain ending at
`Apple Root CA`. Anything else and the bundle is not signed with the Developer
ID, whatever the build log claimed.

**Signing is not notarization.** A signed bundle is still refused by Gatekeeper:
`spctl --assess --type execute "$APP"` answers
`rejected / source=Unnotarized Developer ID` until the bundle has been submitted
to Apple and stapled. That is a separate step run outside this checklist, and no
notarization credential belongs in the repo.

## Steps

1. `bun run --filter app test:live`
   → the four `#[ignore]`d live tests pass.

2. Build signed (see **Signing** above), then
   `ls apps/app/src-tauri/target/release/bundle/macos/OpenNest.app/Contents/MacOS/`
   → **only** `opennest-app`. `fake_claude` next to it means the feature gate
   regressed.

3. Open the `.dmg` from
   `apps/app/src-tauri/target/release/bundle/dmg/`, drag to `/Applications`,
   launch.
   → first launch needs right-click → Open: the bundle is not notarized, so
   Gatekeeper refuses a double-click whether it is ad-hoc or Developer ID
   signed. On a Mac that received the `.dmg` over the network, the fix is
   `xattr -dr com.apple.quarantine /Applications/OpenNest.app`.

4. Read the header.
   → the real CLI version is shown and the status dot is ready. A missing
   version means the app resolved no binary.

5. Send `Remember the number 4271.`
   → the reply streams in token by token, not as one block.

6. Ask it to write a file, e.g. `Write "hello" to /tmp/opennest-smoke.txt`.
   → a permission card appears; Allow once; the activity row turns green.

7. Send a long prompt (`Count from 1 to 300, one number per line.`) and press
   Stop mid-stream.
   → the turn ends cancelled and the composer is usable again.

8. Cmd+Q, then `pgrep -fl claude`.
   → prints nothing. **This is the only check that covers the `RunEvent::Exit`
   wiring.** No automated test can reach it: the suite runs under `MockRuntime`,
   which never emits `RunEvent::Exit`, so the whole `terminate_session` path on
   quit is unverified until this step runs.

9. Relaunch.
   → the transcript is back. Ask `What number did I ask you to remember?`
   → `4271`.

10. Quit, then `echo '{' > ~/Library/Application\ Support/com.opennest.app/session.json`
    and relaunch.
    → empty transcript, no crash, and the file is untouched — a read never
    deletes an unreadable store. Send one prompt, then list the directory
    → `session.json.bak` holds the original `{` and `session.json` is a fresh
    snapshot: the first save moves bytes it cannot parse aside, never over.

11. Quit, then set `"sessionId":"00000000-0000-0000-0000-000000000000"` in
    `session.json` and relaunch.
    → a warning notice appears ("That conversation could not be resumed…"), the
    session is usable, and the transcript is preserved. Relaunch **again**
    → no warning: the dead id was dropped on the first failure.

## Orphan-group check

Run before quitting, then again after. The second run must print nothing but
the header.

```
APP_PID=$(pgrep -x OpenNest); CLAUDE=$(pgrep -P "$APP_PID" -f claude)
PGID=$(ps -o pgid= -p "$CLAUDE" | tr -d ' ')
ps -o pid=,ppid=,pgid=,command= -g "$PGID"
```

Repeat the pair for each way out of the app:

- Cmd+Q
- the red close button
- Force Quit from Activity Monitor

## Known limitations

- Every UI check here is manual because nothing automates it: `e2e_session.rs`
  stops at the Tauri command layer and never mounts React, and `tauri-driver`
  has no macOS support — WKWebView exposes no WebDriver endpoint.
- `kill -9` on the app leaves the process group behind. `SIGKILL` is
  uncatchable, so no handler runs — this is not a failure of the shutdown path.
- A WKWebView content-process crash is not covered. Tauri v2 exposes no portable
  hook for it.
- Real Claude Code **mints a new session id on `--resume`**, so `session.json`
  legitimately carries a different id after each restart. That is the resume
  chain working, not a bug — the check is that the conversation is remembered,
  never that the id is stable.
