import { createQueue } from "../queue"
import type { BotMcpServer } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type McpServersState = {
	botId: string | null
	servers: BotMcpServer[]
}

export type McpServersController = {
	getState: () => McpServersState
	subscribe: (listener: () => void) => () => void
	open: (botId: string) => Promise<void>
	create: (name: string, config: Record<string, unknown>) => void
	rename: (
		openedName: string,
		name: string,
		config: Record<string, unknown>,
	) => void
	remove: (name: string) => void
}

export const initialMcpServersState: McpServersState = {
	botId: null,
	servers: [],
}

export const createMcpServersController = (
	store: TranscriptStore,
): McpServersController => {
	let state = initialMcpServersState
	const listeners = new Set<() => void>()

	const enqueue = createQueue()

	const publish = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const set = (fields: Partial<McpServersState>) => {
		state = { ...state, ...fields }
		publish()
	}

	const applyTo = (botId: string, servers: BotMcpServer[]) => {
		if (state.botId === botId) {
			set({ servers })
		}
	}

	const read = async (botId: string) =>
		applyTo(botId, await store.botMcpServers(botId))

	const reload = () => {
		const botId = state.botId
		if (botId) {
			void enqueue(() => read(botId)).catch(() => undefined)
		}
	}

	const onOpenBot = (run: (botId: string) => Promise<void>) => {
		const botId = state.botId
		if (botId) {
			void enqueue(() => run(botId)).catch(reload)
		}
	}

	const written = (servers: BotMcpServer[], server: BotMcpServer) =>
		servers.some((held) => held.name === server.name)
			? servers.map((held) => (held.name === server.name ? server : held))
			: [...servers, server]

	const write = (
		openedName: string | null,
		name: string,
		config: Record<string, unknown>,
	) =>
		onOpenBot(async (botId) => {
			const server = await store.setBotMcpServer(botId, name, config)
			if (openedName && openedName !== name) {
				await store.deleteBotMcpServer(botId, openedName)
			}
			applyTo(
				botId,
				written(
					state.servers.filter((held) => held.name !== openedName),
					server,
				),
			)
		})

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		open: (botId: string) => {
			set({ botId, servers: [] })
			return enqueue(() => read(botId)).catch(() => undefined)
		},

		create: (name: string, config: Record<string, unknown>) =>
			write(null, name, config),

		rename: write,

		remove: (name: string) =>
			onOpenBot(async (botId) => {
				await store.deleteBotMcpServer(botId, name)
				applyTo(
					botId,
					state.servers.filter((server) => server.name !== name),
				)
			}),
	}
}
