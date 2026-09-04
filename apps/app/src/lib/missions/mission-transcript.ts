import type { Mission } from "./mission-contract"

import type { TranscriptRow } from "@/lib/chat/screen-model"

export type PlacedMission = {
	mission: Mission
	runIndex: number
}

const NOT_PLACED = -1

const openingRunIndex = (runs: TranscriptRow[][], mission: Mission): number => {
	for (let index = runs.length - 1; index >= 0; index -= 1) {
		const run = runs[index][0]
		if (run.timestamp <= mission.openedAt) {
			return run.authorBotId === mission.botId ? index : NOT_PLACED
		}
	}

	return NOT_PLACED
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
