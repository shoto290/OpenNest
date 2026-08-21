import { createQueue } from "../queue"
import type { BotMcpServer } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type McpServersState = {
	/** The bot the servers on hand belong to. `null` is a reader who owns no bot,
	 * which is the only state with nothing to read. */
	botId: string | null
	/** Every server that bot's bundle declares, as the store answered it. */
	servers: BotMcpServer[]
}

export type McpServersController = {
	getState: () => McpServersState
	subscribe: (listener: () => void) => () => void
	/** The bot's servers, read and shown. Called again for the same bot re-reads it:
	 * a bundle a hand wrote into is a bundle this side never heard about. */
	open: (botId: string) => Promise<void>
	/** A server written under the name the reader gave. A name already taken is
	 * replaced, which is what the store does too. */
	create: (name: string, config: Record<string, unknown>) => void
	/** The server filed under `openedName`, written as the reader left it, and moved
	 * if they changed its name. There is no write loop here, unlike the skills': the
	 * name is the key on the disk and a configuration is only ever valid whole, so the
	 * panel saves on a press rather than as it is typed. */
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

	/** Every call in the order it was asked for: a write that landed while the read
	 * was in flight would otherwise be overwritten by an answer that predates it. */
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

	/** The store's own answer, applied only while the bot it was read for is still
	 * the one on hand: a reader who moved on is owed the bundle they moved to. */
	const applyTo = (botId: string, servers: BotMcpServer[]) => {
		if (state.botId === botId) {
			set({ servers })
		}
	}

	const read = async (botId: string) =>
		applyTo(botId, await store.botMcpServers(botId))

	/** What the bundle holds, read again. It is where a refused write lands: neither
	 * the panel nor this has anywhere to say a save did not go through, so the reader
	 * ends up on what the bundle really holds. */
	const reload = () => {
		const botId = state.botId
		if (botId) {
			void enqueue(() => read(botId)).catch(() => undefined)
		}
	}

	/** A write against the bot on hand, or nothing at all: there is no server to
	 * address while no bot is open. */
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

	/** One write for both ways in: a server that does not exist yet names no
	 * `openedName`, and one that does is written under its new name before the old one
	 * is taken away — in that order, so a refused write leaves it where it was. */
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
			// Two bots may declare a server of the same name, so a list left up is how
			// one bot's server ends up read as the other's.
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
