import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import {
	type ConversationMissions,
	type Mission,
	type MissionChanged,
	type MissionDetail,
	type MissionOnBoard,
	type MissionOutcome,
	PERSON_SOURCE,
} from "./mission-contract"

export const MISSION_CHANGED_EVENT = "mission://changed"

export const missionsTransport = {
	board: () => invoke<MissionOnBoard[]>("mission_board"),
	unreported: () => invoke<MissionOnBoard[]>("mission_unreported"),
	reported: (missionId: string, turnId: string | null) =>
		invoke<Mission>("mission_reported", { missionId, turnId }),
	answered: (missionId: string, seq: number) =>
		invoke<Mission>("mission_answered", { missionId, seq }),
	close: (missionId: string, outcome: MissionOutcome, summary: string) =>
		invoke<Mission>("mission_close", {
			missionId,
			closing: { source: PERSON_SOURCE, outcome, summary },
		}),
	detail: (missionId: string) =>
		invoke<MissionDetail>("mission_detail", { missionId }),
	rosterBlock: (conversationId: string, botId: string) =>
		invoke<string | null>("conversation_roster_block", {
			conversationId,
			botId,
		}),
	list: (conversationId: string) =>
		invoke<ConversationMissions>("mission_list", { conversationId }),
	onChanged: (listener: (changed: MissionChanged) => void) =>
		listen<MissionChanged>(MISSION_CHANGED_EVENT, ({ payload }) =>
			listener(payload),
		),
}
