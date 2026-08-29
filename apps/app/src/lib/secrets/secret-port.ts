export const SECRET_SCOPES = ["space", "bot", "server"] as const

export type SecretScope = (typeof SECRET_SCOPES)[number]

export type SecretKeyOwner = {
	scope: SecretScope
	server?: string
	readable: boolean
}

export type StoredSecretKey = {
	key: string
	owners: SecretKeyOwner[]
	servedBy: SecretKeyOwner | null
}

export type StoredSecretKeys = {
	entries: StoredSecretKey[]
}

export type SecretTarget = {
	spaceId: string | null
	botId: string | null
	serverName: string | null
}

export type SecretStoreStatus = {
	isReady: boolean
	needsPassphrase: boolean
	hasVault: boolean
}

export type SecretPort = {
	status: () => Promise<SecretStoreStatus>
	keys: (target: SecretTarget) => Promise<StoredSecretKeys>
	set: (target: SecretTarget, key: string, value: string) => Promise<void>
	delete: (
		target: SecretTarget,
		key: string,
		scope: SecretScope,
		server?: string,
	) => Promise<void>
	unlock: (passphrase: string) => Promise<void>
}

export const scopeOf = (target: SecretTarget): SecretScope => {
	if (target.serverName) return "server"

	return target.botId ? "bot" : "space"
}

export const isWiderThan = (scope: SecretScope, than: SecretScope) =>
	SECRET_SCOPES.indexOf(scope) < SECRET_SCOPES.indexOf(than)
