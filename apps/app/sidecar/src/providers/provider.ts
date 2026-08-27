export type ProviderCapability =
	| "partialMessages"
	| "resume"
	| "interactivePermissions"
	| "modelCatalogue"
	| "toolCatalogue"

export type SessionRequest = {
	cwd: string
	resume?: string
	pluginPath?: string
	agent?: string
	systemPluginPath?: string
	userPluginPath?: string
	spacePluginPath?: string
	identity?: string
	outputStyle?: string
	partialMessages: boolean
}

export type PermissionDecision =
	| { behavior: "allow"; updatedInput: Record<string, unknown> }
	| { behavior: "deny"; message: string }

export type SessionFrame = Record<string, unknown>

export type AgentCommand = {
	name: string
	description?: string
}

export type EmitFrame = (frame: SessionFrame) => void

export type AgentSession = {
	prompt: (text: string) => void
	interrupt: () => Promise<void>
	decide: (requestId: string, decision: PermissionDecision) => void
	close: () => Promise<void>
}

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
	tools: () => Promise<string[]>
	title: (text: string) => Promise<string | null>
	open: (request: SessionRequest, emit: EmitFrame) => Promise<AgentSession>
}

export type StageTarget = {
	directory: string
	targetTriple: string
}

export type ProviderBuild = {
	prepare: () => Promise<void>
	stage: (target: StageTarget) => void
}
