import { openPath } from "@tauri-apps/plugin-opener"

import { isDesktopHost } from "../host"

/** An attached file, opened where the reader already opens files: the app the system
 * hands that kind to. The webview has nothing to show one in, and a `file:` link
 * followed in place would take the reader off the conversation.
 *
 * `bun dev:web` runs in a browser, which has no disk to reach. Refused or
 * unanswered, the app carries on — there was nothing else the click was going to
 * do. */
export const openAttachment = (path: string): void => {
	if (!isDesktopHost()) {
		return
	}
	openPath(path).catch(() => undefined)
}
