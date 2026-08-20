export type ProviderCapability =
	| "partialMessages"
	| "resume"
	| "interactivePermissions"
	| "modelCatalogue"

export type SessionRequest = {
	cwd: string
	resume?: string
	appendSystemPrompt?: string
	partialMessages: boolean
}

export type PermissionDecision =
	| { behavior: "allow"; updatedInput: Record<string, unknown> }
	| { behavior: "deny"; message: string }

export type SessionFrame = Record<string, unknown>

export type EmitFrame = (frame: SessionFrame) => void

export type AgentSession = {
	prompt: (text: string) => void
	interrupt: () => Promise<void>
	decide: (requestId: string, decision: PermissionDecision) => void
	close: () => Promise<void>
}

/** Whether the provider's own credentials are good for a session right now.
 * `detail` says the question could not be answered at all, which is not the same
 * answer as a provider that is simply not signed in. */
export type ProviderAuth = {
	authenticated: boolean
	detail?: string
}

export type AgentProvider = {
	id: string
	version: string
	sdkVersion: string
	capabilities: ProviderCapability[]
	assertReady: () => void
	authenticate: () => Promise<ProviderAuth>
	models: () => Promise<string[]>
	open: (request: SessionRequest, emit: EmitFrame) => Promise<AgentSession>
}

export type ProviderBuild = {
	assetName: string
	prepare: () => Promise<void>
}
