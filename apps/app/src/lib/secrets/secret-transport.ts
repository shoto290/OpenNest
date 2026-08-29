import { invoke } from "@tauri-apps/api/core"

import {
	type SecretPort,
	type SecretStoreStatus,
	type SecretTarget,
	type StoredSecretKeys,
	scopeOf,
} from "./secret-port"

const addressOf = ({ spaceId, botId, serverName }: SecretTarget) => ({
	spaceId: spaceId ?? undefined,
	botId: botId ?? undefined,
	server: serverName ?? undefined,
})

export const secretTransport: SecretPort = {
	status: () => invoke<SecretStoreStatus>("secret_store_status"),

	keys: (target) => invoke<StoredSecretKeys>("secret_keys", addressOf(target)),

	set: (target, key, value) =>
		invoke("secret_set", {
			...addressOf(target),
			key,
			value,
			scope: scopeOf(target),
		}),

	delete: (target, key, scope) =>
		invoke("secret_delete", { ...addressOf(target), key, scope }),

	unlock: (passphrase) => invoke("secret_unlock_vault", { passphrase }),
}
