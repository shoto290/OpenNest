import { useState, useSyncExternalStore } from "react"

import {
	createMcpServersController,
	type McpServersController,
	type McpServersState,
} from "./mcp-servers-controller"

import type { TranscriptStore } from "../conversations/store-port"

export type McpServers = {
	state: McpServersState
	controller: McpServersController
}

export const useMcpServers = (store: TranscriptStore): McpServers => {
	const [controller] = useState(() => createMcpServersController(store))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
