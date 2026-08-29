import {
	type SecretPort,
	type SecretScope,
	type SecretTarget,
	type StoredSecretKey,
	scopeOf,
} from "./secret-port"

import { createQueue } from "../queue"

export type SecretFailure = "save" | "delete"

export type SecretsState = {
	target: SecretTarget | null
	scope: SecretScope
	isReady: boolean
	needsPassphrase: boolean
	hasVault: boolean
	isUnlocking: boolean
	isPassphraseRejected: boolean
	entries: StoredSecretKey[]
	saved: Record<string, SecretScope>
	tookOver: Record<string, SecretScope>
	saving: string[]
	failures: Record<string, SecretFailure>
}

export type SecretsController = {
	getState: () => SecretsState
	subscribe: (listener: () => void) => () => void
	open: (target: SecretTarget) => Promise<void>
	unlock: (passphrase: string) => void
	save: (key: string, value: string) => void
	remove: (key: string, scope: SecretScope) => void
}

export const initialSecretsState: SecretsState = {
	target: null,
	scope: "bot",
	isReady: false,
	needsPassphrase: false,
	hasVault: false,
	isUnlocking: false,
	isPassphraseRejected: false,
	entries: [],
	saved: {},
	tookOver: {},
	saving: [],
	failures: {},
}

const isSameTarget = (one: SecretTarget | null, other: SecretTarget) =>
	one?.spaceId === other.spaceId &&
	one?.botId === other.botId &&
	one?.serverName === other.serverName

const without = (keys: string[], key: string) =>
	keys.filter((held) => held !== key)

const withoutKey = <Value>(held: Record<string, Value>, key: string) => {
	const { [key]: dropped, ...kept } = held
	return kept
}

export const createSecretsController = (
	port: SecretPort,
): SecretsController => {
	let state = initialSecretsState
	const listeners = new Set<() => void>()

	const enqueue = createQueue()

	const publish = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const set = (fields: Partial<SecretsState>) => {
		state = { ...state, ...fields }
		publish()
	}

	const applyTo = (target: SecretTarget, fields: Partial<SecretsState>) => {
		if (isSameTarget(state.target, target)) {
			set(fields)
		}
	}

	const read = async (target: SecretTarget) => {
		const status = await port.status()
		const stored = status.isReady ? await port.keys(target) : { entries: [] }

		applyTo(target, { ...status, entries: stored.entries })
	}

	const write = (
		key: string,
		failure: SecretFailure,
		run: (target: SecretTarget) => Promise<void>,
		reported: (after: SecretsState) => Partial<SecretsState>,
	) => {
		const target = state.target

		if (!target || !state.isReady || state.saving.includes(key)) return

		set({
			saving: [...state.saving, key],
			saved: withoutKey(state.saved, key),
			tookOver: withoutKey(state.tookOver, key),
			failures: withoutKey(state.failures, key),
		})

		void enqueue(async () => {
			try {
				await run(target)
				await read(target)
				applyTo(target, {
					...reported(state),
					saving: without(state.saving, key),
				})
			} catch {
				applyTo(target, {
					saving: without(state.saving, key),
					failures: { ...state.failures, [key]: failure },
				})
			}
		})
	}

	const servingScope = (after: SecretsState, key: string) =>
		after.entries.find((entry) => entry.key === key)?.servedBy?.scope

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		open: (target: SecretTarget) => {
			set({ ...initialSecretsState, target, scope: scopeOf(target) })
			return enqueue(() => read(target)).catch(() => undefined)
		},

		unlock: (passphrase: string) => {
			const target = state.target

			if (!target || state.isUnlocking) return

			set({ isUnlocking: true, isPassphraseRejected: false })

			void enqueue(async () => {
				try {
					await port.unlock(passphrase)
					await read(target)
					applyTo(target, { isUnlocking: false })
				} catch {
					applyTo(target, { isUnlocking: false, isPassphraseRejected: true })
				}
			})
		},

		save: (key, value) =>
			write(
				key,
				"save",
				(target) => port.set(target, key, value),
				(after) => ({ saved: { ...after.saved, [key]: after.scope } }),
			),

		remove: (key, scope) =>
			write(
				key,
				"delete",
				(target) => port.delete(target, key, scope),
				(after) => {
					const serving = servingScope(after, key)

					return serving && serving !== scope
						? { tookOver: { ...after.tookOver, [key]: serving } }
						: {}
				},
			),
	}
}
