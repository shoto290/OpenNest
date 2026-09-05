import { useEffect } from "react"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { createNotifications } from "./create-notifications"
import { createChime } from "./notification-chime"
import { startNotificationSource } from "./notification-source"

import { revealWindow, watchWindowFocus } from "../host"
import type { RosterController } from "../bots/roster-controller"
import type { ChatController } from "../chat/chat-controller"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import { missionsTransport } from "../missions/missions-transport"
import type { OpenedMissionController } from "../missions/opened-mission-controller"
import type { SpacesController } from "../spaces/spaces-controller"
import type { UserController } from "../user/preferences-controller"

export type NotificationsMount = {
	chat: ChatController
	runtimes: ConversationRuntimes
	roster: RosterController
	spaces: SpacesController
	missions: OpenedMissionController
	user: UserController
}

export const useNotifications = ({
	chat,
	runtimes,
	roster,
	spaces,
	missions,
	user,
}: NotificationsMount) => {
	useEffect(
		() =>
			startNotificationSource({
				chat,
				runtimes,
				roster,
				spaces,
				missions: {
					onChanged: missionsTransport.onChanged,
					detail: missionsTransport.detail,
					open: missions.open,
				},
				notifications: createNotifications(),
				switches: () => user.getState().preferences,
				hasFocus: () => document.hasFocus(),
				watchFocus: watchWindowFocus,
				raiseWindow: () => revealWindow({ withFocus: true }),
				playChime: createChime(),
				reportFailure: raiseFailureNotice,
			}),
		[chat, runtimes, roster, spaces, missions, user],
	)
}
