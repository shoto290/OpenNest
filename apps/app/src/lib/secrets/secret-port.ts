export type SecretStoreStatus = {
	isReady: boolean
	needsPassphrase: boolean
	hasVault: boolean
}

export type StoredSecretKeys = {
	readable: string[]
	unreadable: string[]
}

export type SecretPort = {
	status: () => Promise<SecretStoreStatus>
	keys: (botId: string) => Promise<StoredSecretKeys>
	set: (botId: string, key: string, value: string) => Promise<void>
	delete: (botId: string, key: string) => Promise<void>
	unlock: (passphrase: string) => Promise<void>
}
