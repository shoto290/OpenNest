/** Whether the Tauri host is underneath. It injects this global before any of our
 * code runs, and it is the only thing that tells a packaged window apart from
 * `bun dev:web` — asked in one place so the two fakes can never disagree about
 * which of them is live. */
export function isDesktopHost(): boolean {
	return "__TAURI_INTERNALS__" in window
}
