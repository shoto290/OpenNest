# V0.1 smoke checklist — against the real Claude Code CLI

Run against the packaged bundle (`bun run tauri:build`, then open the `.app`), on
a machine where `claude` is installed and signed in. Everything below is manual:
the automated suite uses a fake child, so this is the only pass that exercises
the real binary. Stop at the first line that does not match.

## Preparation

1. `which claude && claude --version` — prints a path and a version; note both.
2. `pgrep -f claude` — prints nothing, so any process found at the end is ours.

## Checklist

1. Launch the bundled app — the window opens, no crash, no unsigned-binary block beyond the usual right-click Open.
2. Connection state on boot — the header settles on ready, and the detected binary version matches step 1 of the preparation.
3. Send a short prompt ("Reply with exactly: OK") — the answer streams in token by token, then completes as one message.
4. Ask for a tool ("Run the bash command `echo OPENNEST_PROBE`") — a tool activity appears while it runs and ends as succeeded, output included.
5. Permission allowed — ask for a file write, the permission prompt appears, allow it, the tool completes and the turn ends normally.
6. Permission denied — ask for another file write, deny it, the activity is marked failed and the turn still ends cleanly.
7. Stop mid-turn — ask for a long answer, press Stop while it streams, the turn ends as cancelled and the partial text stays on screen.
8. Session still usable after Stop — send another prompt, it is answered normally in the same process.
9. Quit — the window closes immediately, with no multi-second hang before the app disappears from the Dock.
10. Relaunch — the previous conversation is restored and a follow-up question about something said before it is answered correctly.
11. Quit again, then `pgrep -f claude` — prints nothing. Any pid here is an orphan and blocks the release.

## Notes

- Step 10 relies on `--resume`; a conversation started before an upgrade of the
  CLI may not resume. Retry once with a fresh conversation before reporting it.
- Step 11 is the release gate. Also check `pgrep -f "$(which claude)"` if the
  install is a shell wrapper rather than the binary itself.
