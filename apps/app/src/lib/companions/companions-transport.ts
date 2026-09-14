import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

export const CREATED_EVENT = "companion://created"

export const FIRST_RUN_DONE_EVENT = "user://first-run-done"

export const SEED_REFUSED_EVENT = "companion://seed-refused"

export type CompanionCreated = {
	id: string
	name: string
}

export type CompanionSeedRefused = {
	reason: string
}

export type LaunchOutcome = {
	created: CompanionCreated | null
	refused: CompanionSeedRefused | null
}

export const companionsTransport = {
	onCreated: (listener: (created: CompanionCreated) => void) =>
		listen<CompanionCreated>(CREATED_EVENT, ({ payload }) => listener(payload)),
	onFirstRunDone: (listener: () => void) =>
		listen(FIRST_RUN_DONE_EVENT, () => listener()),
	onSeedRefused: (listener: (refused: CompanionSeedRefused) => void) =>
		listen<CompanionSeedRefused>(SEED_REFUSED_EVENT, ({ payload }) =>
			listener(payload),
		),
	launchOutcome: () => invoke<LaunchOutcome>("companion_launch_outcome"),
}
