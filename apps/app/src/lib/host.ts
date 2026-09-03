import { convertFileSrc } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { platform } from "@tauri-apps/plugin-os"

export function isDesktopHost(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export function hasOverlayWindowControls(): boolean {
	return isDesktopHost() && platform() === "macos"
}

export function isSidebarResizable(): boolean {
	return !isDesktopHost() || platform() === "macos"
}

export function assetSrc(path: string): string {
	return isDesktopHost() ? convertFileSrc(path) : path
}

export function avatarSrc(path: string | null): string | undefined {
	return path ? assetSrc(path) : undefined
}

export type WindowReveal = {
	withFocus?: boolean
}

export function revealWindow({ withFocus }: WindowReveal = {}): Promise<void> {
	if (!isDesktopHost()) {
		return Promise.resolve()
	}
	const current = getCurrentWindow()
	if (!withFocus) {
		return current.show()
	}
	return current.show().then(() => current.setFocus())
}

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
