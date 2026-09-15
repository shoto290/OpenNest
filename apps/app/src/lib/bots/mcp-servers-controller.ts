import {
	declaredServers,
	declareServer,
	undeclareServer,
} from "./mcp-server-writes"

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
	reload: () => Promise<void>
	create: (name: string, config: Record<string, unknown>) => Promise<boolean>
	rename: (
		openedName: string,
		name: string,
		config: Record<string, unknown>,
	) => Promise<boolean>
	remove: (name: string) => Promise<boolean>
}

export const initialMcpServersState: McpServersState = {
	owner: null,
	servers: [],
	hasFailedToLoad: false,
}

const ownerId = (owner: EnvOwner) => (owner.kind === "user" ? null : owner.id)

const isSameOwner = (left: EnvOwner | null, right: EnvOwner) =>
	left !== null && left.kind === right.kind && ownerId(left) === ownerId(right)

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

	const read = async (owner: EnvOwner) =>
		applyTo(owner, {
			servers: await declaredServers(store, owner),
			hasFailedToLoad: false,
		})

	const noteFailedRead = () => set({ hasFailedToLoad: true })

	const reload = () => {
		const owner = state.owner
		if (!owner) {
			return Promise.resolve()
		}
		return enqueue(() => read(owner)).catch(noteFailedRead)
	}

	const onOpenOwner = (run: (owner: EnvOwner) => Promise<void>) => {
		const owner = state.owner
		if (!owner) {
			return Promise.resolve(false)
		}
		return enqueue(() => run(owner)).then(
			() => true,
			() => reload().then(() => false),
		)
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
			const server = await declareServer(store, owner, name, config)
			if (openedName && openedName !== name) {
				await undeclareServer(store, owner, openedName)
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

		reload,

		create: (name: string, config: Record<string, unknown>) =>
			write(null, name, config),

		rename: write,

		remove: (name: string) =>
			onOpenOwner(async (owner) => {
				await undeclareServer(store, owner, name)
				applyTo(owner, {
					servers: state.servers.filter((server) => server.name !== name),
				})
			}),
	}
}
