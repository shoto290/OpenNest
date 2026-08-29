import type { SecretPort, SecretScope } from "./secret-port"

export type FakeSecretPort = SecretPort & {
	stored: Map<string, string>
	unreadable: Set<string>
	setPassphrase: (passphrase: string) => void
	setVaultWritten: (hasVault: boolean) => void
	failNext: (reason: string) => void
}

const SPACE_HOLDER = "space"

const holderOf = (botId: string, scope: SecretScope) =>
	scope === "space" ? SPACE_HOLDER : botId

const held = (holder: string, key: string) => `${holder}/${key}`

export const createFakeSecretPort = (): FakeSecretPort => {
	const stored = new Map<string, string>()
	const unreadable = new Set<string>()
	let passphrase: string | null = null
	let hasVault = false
	let isUnlocked = true
	let failure: string | null = null

	const refuseOnce = () => {
		if (!failure) return

		const reason = failure
		failure = null
		throw new Error(reason)
	}

	const namesUnder = (holder: string) =>
		[...stored.keys()]
			.filter((entry) => entry.startsWith(`${holder}/`))
			.map((entry) => entry.slice(holder.length + 1))

	return {
		stored,
		unreadable,

		setPassphrase: (next) => {
			passphrase = next
			isUnlocked = false
		},

		setVaultWritten: (next) => {
			hasVault = next
		},

		failNext: (reason) => {
			failure = reason
		},

		status: async () => ({
			isReady: isUnlocked,
			needsPassphrase: !isUnlocked,
			hasVault,
		}),

		keys: async (botId) => {
			const own = namesUnder(botId)
			const inherited = namesUnder(SPACE_HOLDER).filter(
				(key) => !own.includes(key),
			)

			return {
				readable: own.filter((key) => !unreadable.has(key)),
				unreadable: own.filter((key) => unreadable.has(key)),
				inheritedReadable: inherited.filter((key) => !unreadable.has(key)),
				inheritedUnreadable: inherited.filter((key) => unreadable.has(key)),
			}
		},

		set: async (botId, key, value, scope) => {
			refuseOnce()
			stored.set(held(holderOf(botId, scope), key), value)
			unreadable.delete(key)
		},

		delete: async (botId, key, scope) => {
			refuseOnce()
			stored.delete(held(holderOf(botId, scope), key))
			unreadable.delete(key)
		},

		unlock: async (given) => {
			if (given !== passphrase) {
				throw new Error("the passphrase was rejected")
			}
			isUnlocked = true
			hasVault = true
		},
	}
}
