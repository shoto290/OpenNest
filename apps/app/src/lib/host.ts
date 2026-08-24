import { convertFileSrc } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"

export function isDesktopHost(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
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
