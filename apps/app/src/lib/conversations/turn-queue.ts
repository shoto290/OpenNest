export type Summons = {
	botId: string
	promptId: string
}

export type TurnQueue = {
	wave: Summons[]
	waiting: Summons[]
}

export const emptyQueue: TurnQueue = {
	wave: [],
	waiting: [],
}

export const reopenedFor = (
	queue: TurnQueue,
	summoned: Summons[],
): TurnQueue => ({
	wave: queue.wave,
	waiting: [...summoned],
})

export const openedWave = (queue: TurnQueue): TurnQueue =>
	queue.waiting.length === 0
		? queue
		: { ...queue, wave: queue.waiting, waiting: [] }

export const handedOver = (
	queue: TurnQueue,
	from: string,
	summons: Summons,
): TurnQueue => {
	const isHeld = queue.waiting.some(({ botId }) => botId === summons.botId)
	if (summons.botId === from || isHeld) {
		return queue
	}
	return {
		...queue,
		waiting: [...queue.waiting, summons],
	}
}

export const droppedWaiting = (queue: TurnQueue, botId: string): TurnQueue => {
	const waiting = queue.waiting.filter((summons) => summons.botId !== botId)
	return waiting.length === queue.waiting.length ? queue : { ...queue, waiting }
}
