import { authenticateClaude } from "./auth"
import { resolveExecutable } from "./executable"
import { claudeModels } from "./models"
import { openClaudeSession } from "./session"

import type { AgentProvider } from "../provider"
import { EMBEDDED_EXECUTABLE_VERSION, SDK_VERSION } from "./generated/embedded"

export const claudeProvider: AgentProvider = {
	id: "claude",
	version: EMBEDDED_EXECUTABLE_VERSION,
	sdkVersion: SDK_VERSION,
	capabilities: [
		"partialMessages",
		"resume",
		"interactivePermissions",
		"modelCatalogue",
	],
	assertReady: () => {
		resolveExecutable()
	},
	authenticate: authenticateClaude,
	models: claudeModels,
	open: openClaudeSession,
}
