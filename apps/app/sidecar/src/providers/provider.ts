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

/** Where a build drops the files a provider ships beside the sidecar, under the
 * name Tauri reads an external binary as. */
export type StageTarget = {
	directory: string
	targetTriple: string
}

export type ProviderBuild = {
	prepare: () => Promise<void>
	stage: (target: StageTarget) => void
}
