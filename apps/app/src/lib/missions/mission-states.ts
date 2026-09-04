import type { MissionChanged, MissionState } from "./mission-contract"

export type MissionStates = {
	entered: (changed: MissionChanged) => boolean
}

export const createMissionStates = (): MissionStates => {
	const seen = new Map<string, MissionState>()

	return {
		entered: ({ missionId, state }) => {
			const before = seen.get(missionId)
			seen.set(missionId, state)
			return before !== state
		},
	}
}
