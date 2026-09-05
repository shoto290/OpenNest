import { useEffect } from "react"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { startMissionRunDriver } from "./mission-run-driver"
import { missionsTransport } from "./missions-transport"

import type { ChatDriver } from "../chat/driver"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { TranscriptStore } from "../conversations/store-port"

export type MissionRunDriverMount = {
	driver: ChatDriver
	store: TranscriptStore
	runtimes: ConversationRuntimes
}

export const useMissionRunDriver = ({
	driver,
	store,
	runtimes,
}: MissionRunDriverMount) => {
	useEffect(
		() =>
			startMissionRunDriver({
				driver,
				store,
				runtimes,
				missions: missionsTransport,
				reportFailure: raiseFailureNotice,
			}),
		[driver, store, runtimes],
	)
}
