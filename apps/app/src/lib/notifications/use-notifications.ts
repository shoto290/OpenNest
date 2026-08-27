import { useEffect } from "react"

import { createNotifications } from "./create-notifications"
import { createChime } from "./notification-chime"
import { startNotificationSource } from "./notification-source"

import { revealWindow, watchWindowFocus } from "../host"
import type { RosterController } from "../bots/roster-controller"
import type { ChatController } from "../chat/chat-controller"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { UserController } from "../user/preferences-controller"

export type NotificationsMount = {
	chat: ChatController
	runtimes: ConversationRuntimes
	roster: RosterController
	user: UserController
}

export const useNotifications = ({
	chat,
	runtimes,
	roster,
	user,
}: NotificationsMount) => {
	useEffect(
		() =>
			startNotificationSource({
				chat,
				runtimes,
				roster,
				notifications: createNotifications(),
				switches: () => user.getState().preferences,
				hasFocus: () => document.hasFocus(),
				watchFocus: watchWindowFocus,
				raiseWindow: () => revealWindow({ withFocus: true }),
				playChime: createChime(),
			}),
		[chat, runtimes, roster, user],
	)
}
