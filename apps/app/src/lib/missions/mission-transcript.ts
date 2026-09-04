import type { Mission } from "./mission-contract"

import type { TranscriptRow } from "@/lib/chat/screen-model"

export type PlacedMission = {
	mission: Mission
	runIndex: number
}

const NOT_PLACED = -1

const openingRunIndex = (runs: TranscriptRow[][], mission: Mission): number => {
	const spoken = runs.flatMap(([opening], index) =>
		opening.authorBotId === mission.botId
			? [{ index, at: opening.timestamp }]
			: [],
	)
	const opened = spoken.filter(({ at }) => at <= mission.openedAt)

	return (opened.at(-1) ?? spoken[0])?.index ?? NOT_PLACED
}

export const placeMissions = (
	runs: TranscriptRow[][],
	missions: Mission[],
): PlacedMission[] =>
	[...missions]
		.sort((one, other) => one.openedAt - other.openedAt)
		.flatMap((mission) => {
			const runIndex = openingRunIndex(runs, mission)
			return runIndex === NOT_PLACED ? [] : [{ mission, runIndex }]
		})
