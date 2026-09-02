import { invoke } from "@tauri-apps/api/core"

import type { TriggerSource } from "./trigger-contract"

export const triggerSourcesTransport = {
	sources: (botId: string) =>
		invoke<TriggerSource[]>("routine_trigger_sources", { botId }),
}
