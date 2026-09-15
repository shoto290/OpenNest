import type {
	Application,
	ApplicationPort,
	ApplicationsError,
} from "./application-port"

export type ApplicationCommand = keyof ApplicationPort

export type ApplicationCall = {
	command: ApplicationCommand
	query?: string
}

export type FakeApplicationPort = ApplicationPort & {
	calls: ApplicationCall[]
	curated: Application[]
	found: Application[]
	refusals: Partial<Record<ApplicationCommand, ApplicationsError>>
}

export const createFakeApplicationPort = (): FakeApplicationPort => {
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
	}

	return fake
}
