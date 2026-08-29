import {
	type SecretKeyOwner,
	type SecretPort,
	type SecretScope,
	type SecretTarget,
	type StoredSecretKey,
	scopeOf,
} from "./secret-port"

export type FakeSecretPort = SecretPort & {
	stored: Map<string, string>
	unreadable: Set<string>
	hold: (target: SecretTarget, scope: SecretScope, key: string) => void
	setPassphrase: (passphrase: string) => void
	setVaultWritten: (hasVault: boolean) => void
	failNext: (reason: string) => void
}

const ownerOf = (target: SecretTarget, scope: SecretScope) => {
	if (scope === "space") return `space:${target.spaceId}`

	return scope === "bot"
		? `bot:${target.botId}`
		: `server:${target.botId}:${target.serverName}`
}

const held = (owner: string, key: string) => `${owner}/${key}`

const chainOf = (target: SecretTarget): SecretScope[] => {
	const scope = scopeOf(target)

	if (scope === "space") return ["space"]

	return scope === "bot" ? ["space", "bot"] : ["space", "bot", "server"]
}

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

	const ownersOf = (target: SecretTarget, key: string): SecretKeyOwner[] =>
		chainOf(target)
			.filter((scope) => stored.has(held(ownerOf(target, scope), key)))
			.map((scope) => ({
				scope,
				server: scope === "server" ? (target.serverName ?? "") : undefined,
				readable: !unreadable.has(key),
			}))

	const namesUnder = (target: SecretTarget) => {
		const prefixes = chainOf(target).map((scope) => ownerOf(target, scope))

		return [
			...new Set(
				[...stored.keys()]
					.filter((entry) =>
						prefixes.some((prefix) => entry.startsWith(`${prefix}/`)),
					)
					.map((entry) => entry.slice(entry.indexOf("/") + 1)),
			),
		].sort()
	}

	return {
		stored,
		unreadable,

		hold: (target, scope, key) => {
			stored.set(held(ownerOf(target, scope), key), `value-of-${key}`)
		},

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

		keys: async (target) => ({
			entries: namesUnder(target).map((key): StoredSecretKey => {
				const owners = ownersOf(target, key)

				return { key, owners, servedBy: owners.at(-1) ?? null }
			}),
		}),

		set: async (target, key, value) => {
			refuseOnce()
			stored.set(held(ownerOf(target, scopeOf(target)), key), value)
			unreadable.delete(key)
		},

		delete: async (target, key, scope) => {
			refuseOnce()
			stored.delete(held(ownerOf(target, scope), key))
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
