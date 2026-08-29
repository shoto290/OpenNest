export type SecretPort = {
	isReady: () => Promise<boolean>
	keys: (botId: string) => Promise<string[]>
	set: (botId: string, key: string, value: string) => Promise<void>
	delete: (botId: string, key: string) => Promise<void>
}
