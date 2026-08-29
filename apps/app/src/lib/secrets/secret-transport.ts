import { invoke } from "@tauri-apps/api/core"

import type { SecretPort } from "./secret-port"

export const secretTransport: SecretPort = {
	isReady: () => invoke<boolean>("secret_store_ready"),

	keys: (botId) => invoke<string[]>("secret_keys", { botId }),

	set: (botId, key, value) => invoke("secret_set", { botId, key, value }),

	delete: (botId, key) => invoke("secret_delete", { botId, key }),
}
