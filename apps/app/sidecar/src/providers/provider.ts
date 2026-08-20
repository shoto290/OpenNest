export type ProviderCapability =
	| "partialMessages"
	| "resume"
	| "interactivePermissions"
	| "modelCatalogue"

export type AgentProvider = {
	id: string
	version: string
	sdkVersion: string
	capabilities: ProviderCapability[]
	assertReady: () => void
}

export type ProviderBuild = {
	assetName: string
	prepare: () => Promise<void>
}
