import { createQueue } from "../queue"
import type { BotMcpServer, EnvOwner } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type McpServersState = {
	owner: EnvOwner | null
	servers: BotMcpServer[]
	hasFailedToLoad: boolean
}

export type McpServersController = {
	getState: () => McpServersState
	subscribe: (listener: () => void) => () => void
	open: (owner: EnvOwner) => Promise<void>
	create: (name: string, config: Record<string, unknown>) => void
	rename: (
		openedName: string,
		name: string,
		config: Record<string, unknown>,
	) => void
	remove: (name: string) => void
}

export const initialMcpServersState: McpServersState = {
	owner: null,
	servers: [],
	hasFailedToLoad: false,
}

const isSameOwner = (left: EnvOwner | null, right: EnvOwner) =>
	left?.kind === right.kind && left?.id === right.id

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

	const applyTo = (owner: EnvOwner, fields: Partial<McpServersState>) => {
		if (isSameOwner(state.owner, owner)) {
			set(fields)
		}
	}

	const declared = (owner: EnvOwner) =>
		owner.kind === "space"
			? store.spaceMcpServers(owner.id)
			: store.botMcpServers(owner.id)

	const declare = (
		owner: EnvOwner,
		name: string,
		config: Record<string, unknown>,
	) =>
		owner.kind === "space"
			? store.setSpaceMcpServer(owner.id, name, config)
			: store.setBotMcpServer(owner.id, name, config)

	const undeclare = (owner: EnvOwner, name: string) =>
		owner.kind === "space"
			? store.deleteSpaceMcpServer(owner.id, name)
			: store.deleteBotMcpServer(owner.id, name)

	const read = async (owner: EnvOwner) =>
		applyTo(owner, {
			servers: await declared(owner),
			hasFailedToLoad: false,
		})

	const noteFailedRead = () => set({ hasFailedToLoad: true })

	const reload = () => {
		const owner = state.owner
		if (owner) {
			void enqueue(() => read(owner)).catch(noteFailedRead)
		}
	}

	const onOpenOwner = (run: (owner: EnvOwner) => Promise<void>) => {
		const owner = state.owner
		if (owner) {
			void enqueue(() => run(owner)).catch(reload)
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
		onOpenOwner(async (owner) => {
			const server = await declare(owner, name, config)
			if (openedName && openedName !== name) {
				await undeclare(owner, openedName)
			}
			applyTo(owner, {
				servers: written(
					state.servers.filter((held) => held.name !== openedName),
					server,
				),
			})
		})

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		open: (owner: EnvOwner) => {
			set({ owner, servers: [], hasFailedToLoad: false })
			return enqueue(() => read(owner)).catch(noteFailedRead)
		},

		create: (name: string, config: Record<string, unknown>) =>
			write(null, name, config),

		rename: write,

		remove: (name: string) =>
			onOpenOwner(async (owner) => {
				await undeclare(owner, name)
				applyTo(owner, {
					servers: state.servers.filter((server) => server.name !== name),
				})
			}),
	}
}
