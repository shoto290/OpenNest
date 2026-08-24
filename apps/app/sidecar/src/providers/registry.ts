import { claudeProvider } from "./claude"
import type { AgentProvider } from "./provider"

import { describeError } from "../describe-error"

const UNKNOWN_PROVIDER_EXIT_CODE = 64
const NOT_READY_EXIT_CODE = 1

const PROVIDERS: Record<string, AgentProvider> = {
	[claudeProvider.id]: claudeProvider,
}

export const DEFAULT_PROVIDER_ID = claudeProvider.id

export const PROVIDER_IDS = Object.keys(PROVIDERS)

export const findProvider = (id: string): AgentProvider | undefined =>
	PROVIDERS[id]

export const requireProvider = (requestedId?: string): AgentProvider => {
	const id = requestedId ?? DEFAULT_PROVIDER_ID
	const provider = findProvider(id)
	if (!provider) {
		process.stderr.write(
			`Unknown provider "${id}". Known providers: ${PROVIDER_IDS.join(", ")}\n`,
		)
		process.exit(UNKNOWN_PROVIDER_EXIT_CODE)
	}
	try {
		provider.assertReady()
	} catch (error) {
		process.stderr.write(`${describeError(error)}\n`)
		process.exit(NOT_READY_EXIT_CODE)
	}
	return provider
}
