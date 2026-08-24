import { openPath } from "@tauri-apps/plugin-opener"

import { isDesktopHost } from "../host"

export const openAttachment = (path: string): void => {
	if (!isDesktopHost()) {
		return
	}
	openPath(path).catch(() => undefined)
}
