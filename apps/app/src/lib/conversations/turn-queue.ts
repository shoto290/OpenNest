export type Handover = {
	from: string
	to: string
}

export type Summons = {
	botId: string
	promptId: string
}

export type TurnQueue = {
	speaking: Summons | null
	waiting: Summons[]
	handovers: Handover[]
}

const HANDOVERS_BEFORE_NOTICE = 3

export const emptyQueue: TurnQueue = {
	speaking: null,
	waiting: [],
	handovers: [],
}

export const reopenedFor = (
	queue: TurnQueue,
	summoned: Summons[],
): TurnQueue => ({
	speaking: queue.speaking,
	waiting: [...summoned],
	handovers: [],
})

export const startedNext = (queue: TurnQueue): TurnQueue => {
	const [next, ...rest] = queue.waiting
	if (queue.speaking !== null || next === undefined) {
		return queue
	}
	return { ...queue, speaking: next, waiting: rest }
}

export const closedSpeaker = (queue: TurnQueue): TurnQueue =>
	queue.speaking === null ? queue : { ...queue, speaking: null }

export const handedOver = (
	queue: TurnQueue,
	from: string,
	summons: Summons,
): TurnQueue => {
	const isWaiting = queue.waiting.some(({ botId }) => botId === summons.botId)
	if (summons.botId === from || isWaiting) {
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
