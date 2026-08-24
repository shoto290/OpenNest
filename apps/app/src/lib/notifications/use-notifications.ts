import { useEffect } from "react"

import { createNotifications } from "./create-notifications"
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

/** The source, mounted for as long as the app is open. The three controllers are
 * held for the life of the window, so this subscribes once and the states it compares
 * are never lost under it.
 *
 * The switches and the focus are read at each publish rather than closed over: the
 * reader flipping a switch in the settings must not restart the source, and a window
 * that just lost the focus is a window whose reader is already elsewhere. The focus
 * that decides is the one the operating system gives the window; the document's is
 * only what answers where there is no window to watch. */
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
			}),
		[chat, roster, user],
	)
}
