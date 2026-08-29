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

const isSpaceTarget = (target: SecretTarget) => scopeOf(target) === "space"

const spaceIdOf = (target: SecretTarget) => ({ spaceId: target.spaceId ?? "" })

export const secretTransport: SecretPort = {
	status: () => invoke<SecretStoreStatus>("secret_store_status"),

	keys: (target) =>
		isSpaceTarget(target)
			? invoke<StoredSecretKeys>("secret_space_keys", spaceIdOf(target))
			: invoke<StoredSecretKeys>("secret_keys", addressOf(target)),

	set: (target, key, value) =>
		isSpaceTarget(target)
			? invoke("secret_space_set", { ...spaceIdOf(target), key, value })
			: invoke("secret_set", {
					...addressOf(target),
					key,
					value,
					scope: scopeOf(target),
				}),

	delete: (target, key, scope) =>
		isSpaceTarget(target)
			? invoke("secret_space_delete", { ...spaceIdOf(target), key })
			: invoke("secret_delete", { ...addressOf(target), key, scope }),

	unlock: (passphrase) => invoke("secret_unlock_vault", { passphrase }),
}
