import {
	createSdkMcpServer,
	type Options,
} from "@anthropic-ai/claude-agent-sdk"

import {
	DELEGATE_TOOL_NAME,
	type DelegateScope,
	delegateTool,
} from "./delegate"
import { missionTools } from "./mission-tools"
import { routineTools } from "./routine-tools"

export const OPENNEST_SERVER = "opennest"

export const DELEGATE_TOOL = `mcp__${OPENNEST_SERVER}__${DELEGATE_TOOL_NAME}`

export type OpennestScope = DelegateScope & { session?: string }

export const opennestTools = ({ session, ...scope }: OpennestScope) => [
	delegateTool(scope),
	...routineTools(session),
	...missionTools(session),
]

export const opennestServer = (
	scope: OpennestScope,
): NonNullable<Options["mcpServers"]> => ({
	[OPENNEST_SERVER]: createSdkMcpServer({
		name: OPENNEST_SERVER,
		tools: opennestTools(scope),
	}),
})
