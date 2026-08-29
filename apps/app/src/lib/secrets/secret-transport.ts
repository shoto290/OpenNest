import { invoke } from "@tauri-apps/api/core"

import type {
	SecretPort,
	SecretStoreStatus,
	StoredSecretKeys,
} from "./secret-port"

export const secretTransport: SecretPort = {
	status: () => invoke<SecretStoreStatus>("secret_store_status"),

	keys: (botId) => invoke<StoredSecretKeys>("secret_keys", { botId }),

	set: (botId, key, value, scope) =>
		invoke("secret_set", { botId, key, value, scope }),

	delete: (botId, key, scope) => invoke("secret_delete", { botId, key, scope }),

	unlock: (passphrase) => invoke("secret_unlock_vault", { passphrase }),
}
