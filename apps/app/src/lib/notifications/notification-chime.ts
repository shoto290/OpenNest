import chimeUrl from "./notification-chime.wav"

import { isDesktopHost } from "../host"

export const createChime = (): (() => void) => {
	if (!isDesktopHost()) {
		return () => undefined
	}

	const chime = new Audio(chimeUrl)

	return () => {
		chime.currentTime = 0
		chime.play().catch(() => undefined)
	}
}
