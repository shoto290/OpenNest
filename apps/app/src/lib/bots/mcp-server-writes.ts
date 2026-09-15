import type { EnvOwner } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export const declaredServers = (store: TranscriptStore, owner: EnvOwner) => {
	if (owner.kind === "user") {
		return store.userPluginMcpServers()
	}
	return owner.kind === "space"
		? store.spaceMcpServers(owner.id)
		: store.botMcpServers(owner.id)
}

export const declareServer = (
	store: TranscriptStore,
	owner: EnvOwner,
	name: string,
	config: Record<string, unknown>,
) => {
	if (owner.kind === "user") {
		return store.setUserPluginMcpServer(name, config)
	}
	return owner.kind === "space"
		? store.setSpaceMcpServer(owner.id, name, config)
		: store.setBotMcpServer(owner.id, name, config)
}

export const undeclareServer = (
	store: TranscriptStore,
	owner: EnvOwner,
	name: string,
) => {
	if (owner.kind === "user") {
		return store.deleteUserPluginMcpServer(name)
	}
	return owner.kind === "space"
		? store.deleteSpaceMcpServer(owner.id, name)
		: store.deleteBotMcpServer(owner.id, name)
}
