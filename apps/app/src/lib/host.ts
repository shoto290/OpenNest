import { convertFileSrc } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"

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
 * asset protocol, scoped by the host to the directories it writes files in itself.
 *
 * Outside the host there is no protocol to convert to — `convertFileSrc` reaches for
 * internals only a Tauri window injects — so `bun dev:web` is handed the path the
 * fake store answered, unconverted. */
export function assetSrc(path: string): string {
	return isDesktopHost() ? convertFileSrc(path) : path
}

/** A bot's picture, loadable. No path is no source at all, which is what leaves the
 * bot wearing its animal. */
export function avatarSrc(path: string | null): string | undefined {
	return path ? assetSrc(path) : undefined
}

/** Whether the window is also put in front of the reader, and not only on screen. */
export type WindowReveal = {
	withFocus?: boolean
}

/** The window, on screen. It is declared hidden: the frame the platform draws
 * around a webview is drawn before the webview has anything in it, and no stylesheet
 * reaches that frame — the only way not to flash it is not to be on screen for it.
 *
 * Called straight out, never from a frame callback: a webview that is not on screen
 * has its animation frames suspended, so a reveal waiting for one waits forever and
 * the app never appears at all. There is nothing to wait for anyway — the stylesheet
 * is linked on the document and blocks the first paint, so the background of the
 * palette is on the window before this is reached.
 *
 * A host that refuses leaves the window hidden, and nothing can be done about that
 * from inside it.
 *
 * `withFocus` also brings it in front of whatever the reader was doing instead,
 * which is what an answered notification asks for: the reader may have closed the
 * window rather than only looked away, and focusing a window that is not on screen
 * brings nothing back. A launch asks for none of it — the window the platform opens
 * is already the one in front. */
export function revealWindow({ withFocus }: WindowReveal = {}): void {
	if (!isDesktopHost()) {
		return
	}
	const current = getCurrentWindow()
	current.show().catch(() => undefined)
	if (withFocus) {
		current.setFocus().catch(() => undefined)
	}
}

/** The focus the operating system gives a window, watched for as long as the caller
 * holds the returned unsubscribe.
 *
 * Not `document.hasFocus()`: that answers about the caret inside the webview, and it
 * turns false the moment the reader clicks off an input on a window that is still
 * the frontmost one. The platform decides what to do with a notification on the
 * window, so the window is what has to be asked.
 *
 * The state now is reported first, before any change is: a window that has been in
 * front since launch never fires an event, and a source waiting for one would decide
 * on nothing. A host that refuses to answer it reports focused — a notification the
 * platform swallows is a quieter failure than one raised over a reader who is right
 * there.
 *
 * Outside the host there is no window to ask and nothing is ever reported, which
 * leaves the caller on whatever it decides with in the meantime. */
export function watchWindowFocus(
	report: (isFocused: boolean) => void,
): Promise<() => void> {
	if (!isDesktopHost()) {
		return Promise.resolve(() => undefined)
	}
	const current = getCurrentWindow()
	current.isFocused().then(report, () => report(true))
	return current.onFocusChanged(({ payload }) => report(payload))
}
