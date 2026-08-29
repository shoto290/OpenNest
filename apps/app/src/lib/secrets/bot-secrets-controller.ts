import type { SecretPort } from "./secret-port"

import { createQueue } from "../queue"

export type SecretFailure = "save" | "clear"

export type BotSecretsState = {
	botId: string | null
	isReady: boolean
	needsPassphrase: boolean
	hasVault: boolean
	isUnlocking: boolean
	isPassphraseRejected: boolean
	filled: string[]
	unreadable: string[]
	saving: string[]
	failures: Record<string, SecretFailure>
}

export type BotSecretsController = {
	getState: () => BotSecretsState
	subscribe: (listener: () => void) => () => void
	open: (botId: string) => Promise<void>
	unlock: (passphrase: string) => void
	save: (key: string, value: string) => void
	clear: (key: string) => void
}

export const initialBotSecretsState: BotSecretsState = {
	botId: null,
	isReady: false,
	needsPassphrase: false,
	hasVault: false,
	isUnlocking: false,
	isPassphraseRejected: false,
	filled: [],
	unreadable: [],
	saving: [],
	failures: {},
}

const without = (keys: string[], key: string) =>
	keys.filter((held) => held !== key)

const withoutFailure = (
	failures: Record<string, SecretFailure>,
	key: string,
) => {
	const { [key]: dropped, ...kept } = failures
	return kept
}

export const createBotSecretsController = (
	port: SecretPort,
): BotSecretsController => {
	let state = initialBotSecretsState
	const listeners = new Set<() => void>()

	const enqueue = createQueue()

	const publish = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const set = (fields: Partial<BotSecretsState>) => {
		state = { ...state, ...fields }
		publish()
	}

	const applyTo = (botId: string, fields: Partial<BotSecretsState>) => {
		if (state.botId === botId) {
			set(fields)
		}
	}

	const read = async (botId: string) => {
		const status = await port.status()
		const stored = status.isReady
			? await port.keys(botId)
			: { readable: [], unreadable: [] }

		applyTo(botId, {
			...status,
			filled: stored.readable,
			unreadable: stored.unreadable,
		})
	}

	const write = (
		key: string,
		failure: SecretFailure,
		run: (botId: string) => Promise<void>,
	) => {
		const botId = state.botId

		if (!botId || !state.isReady || state.saving.includes(key)) return

		set({
			saving: [...state.saving, key],
			failures: withoutFailure(state.failures, key),
		})

		void enqueue(async () => {
			try {
				await run(botId)
				await read(botId)
				applyTo(botId, { saving: without(state.saving, key) })
			} catch {
				applyTo(botId, {
					saving: without(state.saving, key),
					failures: { ...state.failures, [key]: failure },
				})
			}
		})
	}

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		open: (botId: string) => {
			set({ ...initialBotSecretsState, botId })
			return enqueue(() => read(botId)).catch(() => undefined)
		},

		unlock: (passphrase: string) => {
			const botId = state.botId

			if (!botId || state.isUnlocking) return

			set({ isUnlocking: true, isPassphraseRejected: false })

			void enqueue(async () => {
				try {
					await port.unlock(passphrase)
					await read(botId)
					applyTo(botId, { isUnlocking: false })
				} catch {
					applyTo(botId, {
						isUnlocking: false,
						isPassphraseRejected: true,
					})
				}
			})
		},

		save: (key, value) =>
			write(key, "save", (botId) => port.set(botId, key, value)),

		clear: (key) => write(key, "clear", (botId) => port.delete(botId, key)),
	}
}
