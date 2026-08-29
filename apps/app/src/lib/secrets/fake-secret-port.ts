import type { SecretPort } from "./secret-port"

export type FakeSecretPort = SecretPort & {
	stored: Map<string, string>
	unreadable: Set<string>
	setPassphrase: (passphrase: string) => void
	setVaultWritten: (hasVault: boolean) => void
	failNext: (reason: string) => void
}

const held = (botId: string, key: string) => `${botId}/${key}`

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

	const namesUnder = (botId: string) =>
		[...stored.keys()]
			.filter((entry) => entry.startsWith(`${botId}/`))
			.map((entry) => entry.slice(botId.length + 1))

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

		keys: async (botId) => ({
			readable: namesUnder(botId).filter((key) => !unreadable.has(key)),
			unreadable: namesUnder(botId).filter((key) => unreadable.has(key)),
		}),

		set: async (botId, key, value) => {
			refuseOnce()
			stored.set(held(botId, key), value)
			unreadable.delete(key)
		},

		delete: async (botId, key) => {
			refuseOnce()
			stored.delete(held(botId, key))
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
