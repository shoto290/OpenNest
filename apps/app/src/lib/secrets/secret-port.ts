export type SecretScope = "bot" | "space"

export type SecretStoreStatus = {
	isReady: boolean
	needsPassphrase: boolean
	hasVault: boolean
}

export type StoredSecretKeys = {
	readable: string[]
	unreadable: string[]
	inheritedReadable: string[]
	inheritedUnreadable: string[]
}

export type SecretPort = {
	status: () => Promise<SecretStoreStatus>
	keys: (botId: string) => Promise<StoredSecretKeys>
	set: (
		botId: string,
		key: string,
		value: string,
		scope: SecretScope,
	) => Promise<void>
	delete: (botId: string, key: string, scope: SecretScope) => Promise<void>
	unlock: (passphrase: string) => Promise<void>
}
