import { invoke } from "@tauri-apps/api/core"

import type {
	SecretPort,
	SecretStoreStatus,
	StoredSecretKeys,
} from "./secret-port"

export const secretTransport: SecretPort = {
	status: () => invoke<SecretStoreStatus>("secret_store_status"),

	keys: (botId) => invoke<StoredSecretKeys>("secret_keys", { botId }),

	set: (botId, key, value) => invoke("secret_set", { botId, key, value }),

	delete: (botId, key) => invoke("secret_delete", { botId, key }),

	unlock: (passphrase) => invoke("secret_unlock_vault", { passphrase }),
}
