import { claudeProvider } from "./claude"
import type { AgentProvider } from "./provider"

const PROVIDERS: Record<string, AgentProvider> = {
	[claudeProvider.id]: claudeProvider,
}

export const DEFAULT_PROVIDER_ID = claudeProvider.id

export const PROVIDER_IDS = Object.keys(PROVIDERS)

export const findProvider = (id: string): AgentProvider | undefined =>
	PROVIDERS[id]
