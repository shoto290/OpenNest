import type { SecretKeyOwner } from "@workspace/ui/components/secrets-settings/secrets"

import {
	type SecretPort,
	type SecretScope,
	type SecretTarget,
	type StoredSecretKey,
	scopeOf,
} from "./secret-port"

export type SecretRefusal =
	| { kind: "storeUnavailable"; detail: string }
	| { kind: "vaultLocked" }
	| { kind: "vaultPassphraseRejected" }
	| { kind: "notFound"; key: string }
	| { kind: "invalidKey"; key: string }
	| { kind: "emptyValue" }

export type FakeSecretPort = SecretPort & {
	stored: Map<string, string>
	unreadable: Set<string>
	hold: (
		target: SecretTarget,
		scope: SecretScope,
		key: string,
		server?: string,
	) => void
	setPassphrase: (passphrase: string) => void
	setVaultWritten: (hasVault: boolean) => void
	failNext: (refusal: SecretRefusal) => void
}

type Link = {
	owner: string
	scope: SecretScope
	server: string | null
}

const UNUSABLE_IN_KEY = /[:{}$]/

const spaceOwner = (spaceId: string | null) => `space:${spaceId}`

const botOwner = (botId: string | null) => `bot:${botId}`

const serverOwners = (botId: string | null) => `server:${botId}:`

const serverOwner = (botId: string | null, server: string) =>
	`${serverOwners(botId)}${server}`

const held = (owner: string, key: string) => `${owner}/${key}`

const ownerFor = (
	target: SecretTarget,
	scope: SecretScope,
	server?: string,
) => {
	if (scope === "space") return spaceOwner(target.spaceId)
	if (scope === "bot") return botOwner(target.botId)

	return serverOwner(target.botId, server ?? target.serverName ?? "")
}

export const createFakeSecretPort = (): FakeSecretPort => {
	const stored = new Map<string, string>()
	const unreadable = new Set<string>()
	let passphrase: string | null = null
	let hasVault = false
	let isUnlocked = true
	let refusal: SecretRefusal | null = null

	const refuse = (given: SecretRefusal): never => {
		throw given
	}

	const refuseOnce = () => {
		if (!refusal) return

		const given = refusal
		refusal = null
		refuse(given)
	}

	const refuseWhenLocked = () => {
		if (!isUnlocked) refuse({ kind: "vaultLocked" })
	}

	const ownersUnder = (prefix: string) => [
		...new Set(
			[...stored.keys()]
				.filter((entry) => entry.startsWith(prefix))
				.map((entry) => entry.slice(0, entry.indexOf("/"))),
		),
	]

	const everyServerLink = (target: SecretTarget): Link[] =>
		ownersUnder(serverOwners(target.botId))
			.sort()
			.map((owner) => ({
				owner,
				scope: "server" as const,
				server: owner.slice(serverOwners(target.botId).length),
			}))

	const chainOf = (target: SecretTarget): Link[] => {
		if (scopeOf(target) === "space") {
			return [
				{ owner: spaceOwner(target.spaceId), scope: "space", server: null },
			]
		}

		const chain: Link[] = []

		if (target.spaceId) {
			chain.push({
				owner: spaceOwner(target.spaceId),
				scope: "space",
				server: null,
			})
		}
		chain.push({ owner: botOwner(target.botId), scope: "bot", server: null })

		return [...chain, ...everyServerLink(target)]
	}

	const keysUnder = (owner: string) =>
		[...stored.keys()]
			.filter((entry) => entry.startsWith(`${owner}/`))
			.map((entry) => entry.slice(owner.length + 1))

	const entriesOver = (chain: Link[]): StoredSecretKey[] => {
		const byKey = new Map<string, SecretKeyOwner[]>()

		for (const link of chain) {
			for (const key of keysUnder(link.owner)) {
				const owners = byKey.get(key) ?? []

				owners.push({
					scope: link.scope,
					server: link.server ?? undefined,
					readable: !unreadable.has(held(link.owner, key)),
				})
				byKey.set(key, owners)
			}
		}

		return [...byKey.entries()]
			.sort(([one], [other]) => one.localeCompare(other))
			.map(([key, owners]) => ({
				key,
				owners,
				servedBy: [...owners].reverse().find((owner) => owner.readable) ?? null,
			}))
	}

	return {
		stored,
		unreadable,

		hold: (target, scope, key, server) => {
			stored.set(held(ownerFor(target, scope, server), key), `value-of-${key}`)
		},

		setPassphrase: (next) => {
			passphrase = next
			isUnlocked = false
		},

		setVaultWritten: (next) => {
			hasVault = next
		},

		failNext: (next) => {
			refusal = next
		},

		status: async () => ({
			isReady: isUnlocked,
			needsPassphrase: !isUnlocked,
			hasVault,
		}),

		keys: async (target) => {
			refuseWhenLocked()

			return { entries: entriesOver(chainOf(target)) }
		},

		set: async (target, key, value) => {
			refuseOnce()
			refuseWhenLocked()

			if (key.length === 0 || UNUSABLE_IN_KEY.test(key)) {
				refuse({ kind: "invalidKey", key })
			}

			const trimmed = value.trim()

			if (trimmed.length === 0) refuse({ kind: "emptyValue" })

			const owner = ownerFor(target, scopeOf(target))

			stored.set(held(owner, key), trimmed)
			unreadable.delete(held(owner, key))
		},

		delete: async (target, key, scope, server) => {
			refuseOnce()
			refuseWhenLocked()

			const owner = ownerFor(target, scope, server)

			if (!stored.has(held(owner, key))) refuse({ kind: "notFound", key })

			stored.delete(held(owner, key))
		},

		unlock: async (given) => {
			if (given !== passphrase) {
				refuse({ kind: "vaultPassphraseRejected" })
			}
			isUnlocked = true
			hasVault = true
		},
	}
}
