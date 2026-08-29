import { invoke } from "@tauri-apps/api/core"

import {
	type SecretPort,
	type SecretScope,
	type SecretStoreStatus,
	type SecretTarget,
	type StoredSecretKeys,
	scopeOf,
} from "./secret-port"

const addressOf = (target: SecretTarget, scope: SecretScope) => ({
	spaceId: target.spaceId ?? undefined,
	botId: target.botId ?? undefined,
	server: target.serverName ?? undefined,
	scope,
})

export const secretTransport: SecretPort = {
	status: () => invoke<SecretStoreStatus>("secret_store_status"),

	keys: (target) =>
		invoke<StoredSecretKeys>("secret_keys", {
			target: addressOf(target, scopeOf(target)),
		}),

	set: (target, key, value) =>
		invoke("secret_set", {
			target: addressOf(target, scopeOf(target)),
			key,
			value,
		}),

	delete: (target, key, scope, server) =>
		invoke("secret_delete", {
			target: {
				...addressOf(target, scope),
				server: server ?? target.serverName ?? undefined,
			},
			key,
		}),

	unlock: (passphrase) => invoke("secret_unlock_vault", { passphrase }),
}
