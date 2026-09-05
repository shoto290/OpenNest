import type { MissionChanged, MissionDetail } from "./mission-contract"
import type { OpenedMission } from "./opened-mission-controller"

export type FakeMissions = {
	onChanged: (
		listener: (changed: MissionChanged) => void,
	) => Promise<() => void>
	detail: (missionId: string) => Promise<MissionDetail>
	open: (opened: OpenedMission) => void
	opened: OpenedMission[]
	hold: (detail: MissionDetail) => void
	refuse: (missionId: string) => void
	change: (changed: MissionChanged) => void
}

export const createFakeMissions = (): FakeMissions => {
	const details = new Map<string, MissionDetail>()
	const refused = new Set<string>()
	const listeners = new Set<(changed: MissionChanged) => void>()
	const opened: OpenedMission[] = []

	return {
		opened,

		onChanged: async (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		detail: async (missionId) => {
			const held = details.get(missionId)
			if (refused.has(missionId) || !held) {
				throw new Error(`no mission answers ${missionId}`)
			}
			return held
		},

		open: (next) => {
			opened.push(next)
		},

		hold: (detail) => {
			details.set(detail.mission.id, detail)
		},

		refuse: (missionId) => {
			refused.add(missionId)
		},

		change: (changed) => {
			for (const listener of [...listeners]) {
				listener(changed)
			}
		},
	}
}
