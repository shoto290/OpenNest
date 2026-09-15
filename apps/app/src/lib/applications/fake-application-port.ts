import type {
	Application,
	ApplicationInstalled,
	ApplicationPort,
	ApplicationsError,
} from "./application-port"

export type ApplicationCommand = "catalogue" | "search"

export type ApplicationCall = {
	command: ApplicationCommand
	query?: string
}

export type FakeApplicationPort = ApplicationPort & {
	calls: ApplicationCall[]
	curated: Application[]
	found: Application[]
	refusals: Partial<Record<ApplicationCommand, ApplicationsError>>
	announce: (installed: ApplicationInstalled) => void
	isListening: () => boolean
}

export const createFakeApplicationPort = (): FakeApplicationPort => {
	const listeners = new Set<(installed: ApplicationInstalled) => void>()

	const answer = (call: ApplicationCall) => {
		fake.calls.push(call)
		const refusal = fake.refusals[call.command]
		if (refusal !== undefined) {
			throw refusal
		}
	}

	const fake: FakeApplicationPort = {
		calls: [],
		curated: [],
		found: [],
		refusals: {},

		catalogue: async () => {
			answer({ command: "catalogue" })
			return fake.curated
		},

		search: async (query) => {
			answer({ command: "search", query })
			return fake.found
		},

		onInstalled: async (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		announce: (installed) => {
			for (const listener of listeners) {
				listener(installed)
			}
		},

		isListening: () => listeners.size > 0,
	}

	return fake
}
