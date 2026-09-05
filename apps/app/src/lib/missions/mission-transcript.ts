import type { Mission } from "./mission-contract"

import type { TranscriptRow } from "@/lib/chat/screen-model"

export type PlacedMission = {
	mission: Mission
	runIndex: number
}

const NOT_PLACED = -1

const openingRunIndex = (runs: TranscriptRow[][], mission: Mission): number => {
	const spoken = runs.flatMap(([opening], index) =>
		opening.authorBotId === mission.botId ? [index] : [],
	)
	const distanceOf = (index: number) =>
		Math.abs(runs[index][0].timestamp - mission.openedAt)

	return spoken.reduce(
		(nearest, index) =>
			nearest === NOT_PLACED || distanceOf(index) <= distanceOf(nearest)
				? index
				: nearest,
		NOT_PLACED,
	)
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
