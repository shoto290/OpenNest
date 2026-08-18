/** Whether the Tauri host is underneath. It injects this global before any of our
 * code runs, and it is the only thing that tells a packaged window apart from
 * `bun dev:web` — asked in one place so the two fakes can never disagree about
 * which of them is live.
 *
 * No window at all is the third answer, and it is not the host: a unit test runs
 * this logic outside a document, and asking for a global that is not there would
 * throw rather than answer. */
export function isDesktopHost(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}
