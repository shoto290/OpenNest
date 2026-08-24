import { useEffect } from "react"

import { createNotifications } from "./create-notifications"
import { createChime } from "./notification-chime"
import { startNotificationSource } from "./notification-source"

import { revealWindow, watchWindowFocus } from "../host"
import type { RosterController } from "../bots/roster-controller"
import type { ChatController } from "../chat/chat-controller"
import type { UserController } from "../user/user-controller"

export type NotificationsMount = {
	chat: ChatController
	roster: RosterController
	user: UserController
}

export const useNotifications = ({
	chat,
	roster,
	user,
}: NotificationsMount) => {
	useEffect(
		() =>
			startNotificationSource({
				chat,
				roster,
				notifications: createNotifications(),
				switches: () => user.getState().profile,
				hasFocus: () => document.hasFocus(),
				watchFocus: watchWindowFocus,
				raiseWindow: () => revealWindow({ withFocus: true }),
				playChime: createChime(),
			}),
		[chat, roster, user],
	)
}
