export type ProviderCapability =
	| "partialMessages"
	| "resume"
	| "interactivePermissions"
	| "modelCatalogue"
	| "toolCatalogue"

export type SessionRequest = {
	cwd: string
	resume?: string
	/** The bot's plugin bundle, loaded for the session and never installed, and the
	 * agent inside it the main thread is promoted to. Named apart from any provider's
	 * spelling of them: the provider module turns the pair into its own options. */
	pluginPath?: string
	agent?: string
	/** The output style the host names for this session, by the name the provider
	 * knows it under. Left out, the provider's own default stands. */
	outputStyle?: string
	partialMessages: boolean
}

export type PermissionDecision =
	| { behavior: "allow"; updatedInput: Record<string, unknown> }
	| { behavior: "deny"; message: string }

export type SessionFrame = Record<string, unknown>

/** A slash command as the host lists it: what the reader types, and the one line
 * the provider said about it. Mirrors `AgentCommand` on the Rust side — a
 * provider naming no description leaves the key out. */
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
	/** The built-in tools a session of this provider can be given, without the ones
	 * an MCP server provides: those belong to a server rather than to the install,
	 * and nothing here offers to hold one back. */
	tools: () => Promise<string[]>
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
