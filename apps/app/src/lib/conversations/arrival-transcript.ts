import type { CompanionArrival, TranscriptMessage } from "./transcript-contract"

import type { TranscriptRow } from "@/lib/chat/screen-model"
import { BEFORE_FIRST_RUN } from "@/lib/missions/mission-transcript"

export type PlacedArrival = {
	arrival: CompanionArrival
	runIndex: number
}

type ArrivalPlacement = {
	runs: TranscriptRow[][]
	messages: TranscriptMessage[]
	arrivals: CompanionArrival[]
	hasOlder: boolean
}

const newestSeqOf = (
	run: TranscriptRow[],
	seqs: ReadonlyMap<string, number>,
): number =>
	run.reduce(
		(newest, { messageId }) => Math.max(newest, seqs.get(messageId) ?? newest),
		Number.NEGATIVE_INFINITY,
	)

const lastRunAtOrBelow = (newestSeqs: number[], lastMessageSeq: number) =>
	newestSeqs.reduce(
		(last, newest, index) => (newest <= lastMessageSeq ? index : last),
		BEFORE_FIRST_RUN,
	)

export const placeArrivals = ({
	runs,
	messages,
	arrivals,
	hasOlder,
}: ArrivalPlacement): PlacedArrival[] => {
	const seqs = new Map(messages.map(({ id, seq }) => [id, seq]))
	const newestSeqs = runs.map((run) => newestSeqOf(run, seqs))
	const maskedBelow = hasOlder ? (messages[0]?.seq ?? null) : null

	return arrivals
		.filter(
			({ lastMessageSeq }) =>
				maskedBelow === null || lastMessageSeq >= maskedBelow,
		)
		.map((arrival) => ({
			arrival,
			runIndex: lastRunAtOrBelow(newestSeqs, arrival.lastMessageSeq),
		}))
}
