import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk"

import type { EmitFrame, PermissionDecision } from "../provider"

type Waiting = (decision: PermissionDecision) => void

export const createPermissionGate = (emit: EmitFrame) => {
	const waiting = new Map<string, Waiting>()

	const canUseTool: CanUseTool = (toolName, input, options) =>
		new Promise<PermissionDecision>((resolve) => {
			waiting.set(options.requestId, resolve)
			emit({
				type: "control_request",
				request_id: options.requestId,
				request: {
					subtype: "can_use_tool",
					tool_name: toolName,
					display_name: options.displayName ?? null,
					description: options.description ?? null,
					input,
				},
			})
		})

	return {
		canUseTool,
		decide: (requestId: string, decision: PermissionDecision) => {
			const resolve = waiting.get(requestId)
			if (!resolve) {
				return
			}
			waiting.delete(requestId)
			resolve(decision)
		},
		denyAll: (message: string) => {
			for (const resolve of waiting.values()) {
				resolve({ behavior: "deny", message })
			}
			waiting.clear()
		},
	}
}
