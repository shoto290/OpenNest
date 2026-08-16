type FrameListener = (now: number) => void

const NOOP: FrameListener = () => {}

const listeners = new Set<FrameListener>()
const running: FrameListener[] = []
let frame: number | null = null

const tick = (now: number) => {
	let count = 0
	for (const listener of listeners) running[count++] = listener
	for (let index = 0; index < count; index += 1) {
		const listener = running[index]
		running[index] = NOOP
		listener(now)
	}
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
