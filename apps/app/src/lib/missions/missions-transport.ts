import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type { ConversationMissions, MissionChanged } from "./mission-contract"

export const CHANGED_EVENT = "mission://changed"

export const missionsTransport = {
	list: (conversationId: string) =>
		invoke<ConversationMissions>("mission_list", { conversationId }),
	onChanged: (listener: (changed: MissionChanged) => void) =>
		listen<MissionChanged>(CHANGED_EVENT, ({ payload }) => listener(payload)),
}
