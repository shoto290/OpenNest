import type { SecretPort, SecretScope } from "./secret-port"

import { createQueue } from "../queue"

export type SecretFailure = "save" | "clear"

export type BotSecretsState = {
	botId: string | null
	isReady: boolean
	needsPassphrase: boolean
	hasVault: boolean
	isUnlocking: boolean
	isPassphraseRejected: boolean
	hasSpace: boolean
	filled: string[]
	unreadable: string[]
	inherited: string[]
	inheritedUnreadable: string[]
	shadowed: string[]
	saved: Record<string, SecretScope>
	saving: string[]
	failures: Record<string, SecretFailure>
}

export type BotSecretsController = {
	getState: () => BotSecretsState
	subscribe: (listener: () => void) => () => void
	open: (botId: string, hasSpace: boolean) => Promise<void>
	unlock: (passphrase: string) => void
	save: (key: string, value: string, scope: SecretScope) => void
	clear: (key: string, scope: SecretScope) => void
}

export const initialBotSecretsState: BotSecretsState = {
	botId: null,
	isReady: false,
	needsPassphrase: false,
	hasVault: false,
	isUnlocking: false,
	isPassphraseRejected: false,
	hasSpace: false,
	filled: [],
	unreadable: [],
	inherited: [],
	inheritedUnreadable: [],
	shadowed: [],
	saved: {},
	saving: [],
	failures: {},
}

const BLANK_KEYS = {
	readable: [],
	unreadable: [],
	inheritedReadable: [],
	inheritedUnreadable: [],
}

const without = (keys: string[], key: string) =>
	keys.filter((held) => held !== key)

const withoutKey = <Value>(held: Record<string, Value>, key: string) => {
	const { [key]: dropped, ...kept } = held
	return kept
}

const withKey = (keys: string[], key: string) =>
	keys.includes(key) ? keys : [...keys, key]

const originOf = (state: BotSecretsState, key: string): SecretScope | null => {
	if (state.filled.includes(key) || state.unreadable.includes(key)) return "bot"

	return state.inherited.includes(key) ||
		state.inheritedUnreadable.includes(key)
		? "space"
		: null
}

const shadows = (state: BotSecretsState, key: string, scope: SecretScope) => {
	const origin = originOf(state, key)

	return origin !== null && origin !== scope
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
		const stored = status.isReady ? await port.keys(botId) : BLANK_KEYS

		applyTo(botId, {
			...status,
			filled: stored.readable,
			unreadable: stored.unreadable,
			inherited: stored.inheritedReadable,
			inheritedUnreadable: stored.inheritedUnreadable,
		})
	}

	const write = (
		key: string,
		failure: SecretFailure,
		run: (botId: string) => Promise<void>,
		done: (state: BotSecretsState) => Partial<BotSecretsState>,
	) => {
		const botId = state.botId

		if (!botId || !state.isReady || state.saving.includes(key)) return

		const reported = done(state)

		set({
			saving: [...state.saving, key],
			saved: withoutKey(state.saved, key),
			failures: withoutKey(state.failures, key),
		})

		void enqueue(async () => {
			try {
				await run(botId)
				await read(botId)
				applyTo(botId, { ...reported, saving: without(state.saving, key) })
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

		open: (botId: string, hasSpace: boolean) => {
			set({ ...initialBotSecretsState, botId, hasSpace })
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

		save: (key, value, scope) =>
			write(
				key,
				"save",
				(botId) => port.set(botId, key, value, scope),
				(before) => ({
					saved: { ...before.saved, [key]: scope },
					shadowed: shadows(before, key, scope)
						? withKey(before.shadowed, key)
						: before.shadowed,
				}),
			),

		clear: (key, scope) =>
			write(
				key,
				"clear",
				(botId) => port.delete(botId, key, scope),
				(before) => ({ shadowed: without(before.shadowed, key) }),
			),
	}
}
