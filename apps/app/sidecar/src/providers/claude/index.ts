import { authenticateClaude } from "./auth"
import { resolveExecutable } from "./executable"
import { claudeModels } from "./models"
import { openClaudeSession } from "./session"
import { claudeTools } from "./tools"

import type { AgentProvider } from "../provider"
import { EXECUTABLE_VERSION, SDK_VERSION } from "./generated/manifest"

export const claudeProvider: AgentProvider = {
	id: "claude",
	version: EXECUTABLE_VERSION,
	sdkVersion: SDK_VERSION,
	capabilities: [
		"partialMessages",
		"resume",
		"interactivePermissions",
		"modelCatalogue",
		"toolCatalogue",
	],
	assertReady: () => {
		resolveExecutable()
	},
	authenticate: authenticateClaude,
	models: claudeModels,
	tools: claudeTools,
	open: openClaudeSession,
}
