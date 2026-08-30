import type { EnvEntry, EnvScope } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type EnvironmentState = {
	scope: EnvScope | null
	entries: EnvEntry[]
	hasFailedToRead: boolean
}

export type EnvironmentController = {
	getState: () => EnvironmentState
	subscribe: (listener: () => void) => () => void
	open: (scope: EnvScope) => Promise<void>
	set: (name: string, value: string) => Promise<void>
	remove: (name: string) => Promise<void>
}

const initialEnvironmentState: EnvironmentState = {
	scope: null,
	entries: [],
	hasFailedToRead: false,
}

export const createEnvironmentController = (
	store: TranscriptStore,
): EnvironmentController => {
	let state = initialEnvironmentState
	const listeners = new Set<() => void>()

	const publish = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const set = (fields: Partial<EnvironmentState>) => {
		state = { ...state, ...fields }
		publish()
	}

	const read = (scope: EnvScope) =>
		store
			.environmentVariables(scope)
			.then((entries) => {
				if (state.scope === scope) {
					set({ entries, hasFailedToRead: false })
				}
			})
			.catch(() => {
				if (state.scope === scope) {
					set({ hasFailedToRead: true })
				}
			})

	const write = async (run: (scope: EnvScope) => Promise<void>) => {
		const scope = state.scope
		if (!scope) {
			return
		}
		await run(scope)
		await read(scope)
	}

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		open: (scope: EnvScope) => {
			set({ scope, entries: [], hasFailedToRead: false })
			return read(scope)
		},

		set: (name: string, value: string) =>
			write((scope) => store.setEnvironmentVariable(scope, name, value)),

		remove: (name: string) =>
			write((scope) => store.deleteEnvironmentVariable(scope, name)),
	}
}
