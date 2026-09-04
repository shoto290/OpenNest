import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type {
	ConversationMissions,
	MissionChanged,
	MissionDetail,
	MissionOnBoard,
} from "./mission-contract"

export const MISSION_CHANGED_EVENT = "mission://changed"

export const missionsTransport = {
	board: () => invoke<MissionOnBoard[]>("mission_board"),
	detail: (missionId: string) =>
		invoke<MissionDetail>("mission_detail", { missionId }),
	list: (conversationId: string) =>
		invoke<ConversationMissions>("mission_list", { conversationId }),
	onChanged: (listener: (changed: MissionChanged) => void) =>
		listen<MissionChanged>(MISSION_CHANGED_EVENT, ({ payload }) =>
			listener(payload),
		),
}
