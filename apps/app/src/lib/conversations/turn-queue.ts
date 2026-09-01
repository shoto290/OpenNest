export type Handover = {
	from: string
	to: string
}

export type Summons = {
	botId: string
	promptId: string
}

export type TurnQueue = {
	wave: Summons[]
	waiting: Summons[]
	handovers: Handover[]
}

const HANDOVERS_BEFORE_NOTICE = 3

export const emptyQueue: TurnQueue = {
	wave: [],
	waiting: [],
	handovers: [],
}

export const reopenedFor = (
	queue: TurnQueue,
	summoned: Summons[],
): TurnQueue => ({
	wave: queue.wave,
	waiting: [...summoned],
	handovers: [],
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
		handovers: [...queue.handovers, { from, to: summons.botId }],
	}
}

const isBetween = (handover: Handover, pair: [string, string]) =>
	pair.includes(handover.from) && pair.includes(handover.to)

export const loopingPairIn = (
	handovers: Handover[],
): [string, string] | null => {
	const last = handovers.at(-1)
	if (!last) {
		return null
	}
	const pair: [string, string] = [last.from, last.to]
	let trailing = 0
	for (let index = handovers.length - 1; index >= 0; index -= 1) {
		const handover = handovers[index]
		const follows = handovers[index + 1]
		if (!isBetween(handover, pair)) {
			break
		}
		if (follows && follows.from !== handover.to) {
			break
		}
		trailing += 1
	}
	return trailing >= HANDOVERS_BEFORE_NOTICE ? pair : null
}
