type FrameListener = (now: number) => void

const listeners = new Set<FrameListener>()
let frame: number | null = null

const tick = (now: number) => {
	for (const listener of [...listeners]) listener(now)
	frame = listeners.size > 0 ? requestAnimationFrame(tick) : null
}

export const onBotAvatarFrame = (listener: FrameListener) => {
	listeners.add(listener)
	if (frame === null) frame = requestAnimationFrame(tick)
	return () => {
		listeners.delete(listener)
		if (listeners.size === 0 && frame !== null) {
			cancelAnimationFrame(frame)
			frame = null
		}
	}
}
