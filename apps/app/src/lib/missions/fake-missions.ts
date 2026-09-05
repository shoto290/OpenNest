import type { Mission, MissionChanged, MissionDetail } from "./mission-contract"
import type { OpenedMission } from "./opened-mission-controller"

export type FakeMissions = {
	board: () => Promise<{ mission: Mission }[]>
	onChanged: (
		listener: (changed: MissionChanged) => void,
	) => Promise<() => void>
	detail: (missionId: string) => Promise<MissionDetail>
	open: (opened: OpenedMission) => void
	opened: OpenedMission[]
	hold: (detail: MissionDetail) => void
	place: (missions: Mission[]) => void
	stall: () => void
	release: () => void
	refuseBoard: () => void
	refuse: (missionId: string) => void
	change: (changed: MissionChanged) => void
}

export const createFakeMissions = (): FakeMissions => {
	const details = new Map<string, MissionDetail>()
	const refused = new Set<string>()
	const listeners = new Set<(changed: MissionChanged) => void>()
	const opened: OpenedMission[] = []
	let placed: Mission[] = []
	let isBoardRefused = false
	let readable = Promise.resolve()
	let makeReadable: () => void = () => undefined

	return {
		opened,

		board: async () => {
			await readable
			if (isBoardRefused) {
				throw new Error("the board could not be read")
			}
			return placed.map((mission) => ({ mission }))
		},

		place: (next) => {
			placed = next
		},

		stall: () => {
			readable = new Promise<void>((resolve) => {
				makeReadable = resolve
			})
		},

		release: () => {
			makeReadable()
		},

		refuseBoard: () => {
			isBoardRefused = true
		},

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
