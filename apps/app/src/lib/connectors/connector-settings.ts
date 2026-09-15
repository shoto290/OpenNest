import type {
	BotMcpConnectionState,
	BotMcpServerItem,
} from "@workspace/ui/components/bot-settings"
import type { McpConnectionSection } from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import { readMcpServerLaunch } from "@workspace/ui/components/bot-settings-dialog/mcp-server-launch"

import type { ConnectorsState } from "./connectors-controller"
import type { Connectors } from "./use-connectors"

import type { BotMcpServer } from "../conversations/store-contract"

export const CONNECTORS_TAB = "mcp"

export type ConnectorSettings = {
	mcpServers: BotMcpServerItem[]
	onServerConnect: (server: BotMcpServerItem) => void
	serverConnection?: McpConnectionSection
}

type ConnectorSettingsSource = {
	servers: BotMcpServer[]
	connectors: Connectors
	openedName: string | null
	onSettled?: () => void
}

const urlOf = (server: BotMcpServer) =>
	readMcpServerLaunch(server.config).url ?? ""

const hostOf = (url: string) =>
	URL.canParse(url) ? new URL(url).host : undefined

const connectionOf = (
	state: ConnectorsState,
	name: string,
): BotMcpConnectionState | undefined => {
	if (state.connecting === name) {
		return "connecting"
	}
	if (state.failure?.command === "connect" && state.failure.name === name) {
		return "failed"
	}
	const status = state.rows.find((row) => row.name === name)?.status
	return status === "unknown" ? undefined : status
}

type ConnectorLanding = "connected" | "disconnected"

const isLanded = (
	{ controller }: Connectors,
	name: string,
	landing: ConnectorLanding,
) => {
	const isConnected =
		controller.getState().rows.find((row) => row.name === name)?.status ===
		"connected"
	return landing === "connected" ? isConnected : !isConnected
}

const settling =
	(connectors: Connectors, onSettled?: () => void) =>
	(name: string, landing: ConnectorLanding, run: Promise<void>) => {
		void run.then(() => {
			if (isLanded(connectors, name, landing)) {
				onSettled?.()
			}
		})
	}

type ConnectorRuns = (
	name: string,
	landing: ConnectorLanding,
	run: Promise<void>,
) => void

const sectionOf = (
	{ state, controller }: Connectors,
	server: BotMcpServer,
	settle: ConnectorRuns,
): McpConnectionSection | undefined => {
	const connection = connectionOf(state, server.name)
	if (!connection) {
		return undefined
	}
	const url = urlOf(server)

	return {
		state: connection,
		host: hostOf(url),
		onConnect: () => {
			settle(server.name, "connected", controller.connect(server.name, url))
		},
		onCancel: () => {
			void controller.cancel()
		},
		onDisconnect: () => {
			settle(
				server.name,
				"disconnected",
				controller.disconnect(server.name, url),
			)
		},
	}
}

export const toConnectorSettings = ({
	servers,
	connectors,
	openedName,
	onSettled,
}: ConnectorSettingsSource): ConnectorSettings => {
	const opened = servers.find((server) => server.name === openedName)
	const settle = settling(connectors, onSettled)

	return {
		mcpServers: servers.map((server) => ({
			...server,
			connection: connectionOf(connectors.state, server.name),
		})),
		onServerConnect: (server) => {
			settle(
				server.name,
				"connected",
				connectors.controller.connect(server.name, urlOf(server)),
			)
		},
		serverConnection: opened && sectionOf(connectors, opened, settle),
	}
}
