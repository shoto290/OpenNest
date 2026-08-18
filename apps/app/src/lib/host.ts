import { convertFileSrc } from "@tauri-apps/api/core"

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

/** The one way a path the host stored becomes something the webview may load: the
 * asset protocol, scoped by the host to the single directory avatars live in. A bot
 * with no picture has no source at all, which is what leaves it wearing its animal.
 *
 * Outside the host there is no protocol to convert to — `convertFileSrc` reaches for
 * internals only a Tauri window injects — so `bun dev:web` is handed the path the
 * fake store answered, unconverted. */
export function avatarSrc(path: string | null): string | undefined {
	if (!path) {
		return undefined
	}
	return isDesktopHost() ? convertFileSrc(path) : path
}
