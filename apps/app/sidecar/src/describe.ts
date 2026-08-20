import type { AgentProvider } from "./providers/provider"

export const describeProvider = (provider: AgentProvider) => ({
	provider: provider.id,
	version: provider.version,
	sdkVersion: provider.sdkVersion,
	capabilities: provider.capabilities,
})
