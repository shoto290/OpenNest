import { resolveExecutable } from "./executable"
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
	open: openClaudeSession,
}
