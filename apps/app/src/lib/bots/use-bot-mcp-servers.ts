import { useState, useSyncExternalStore } from "react"

import {
	createMcpServersController,
	type McpServersController,
	type McpServersState,
} from "./mcp-servers-controller"

import type { TranscriptStore } from "../conversations/store-port"

export type BotMcpServers = {
	state: McpServersState
	controller: McpServersController
}

export const useBotMcpServers = (store: TranscriptStore): BotMcpServers => {
	const [controller] = useState(() => createMcpServersController(store))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
