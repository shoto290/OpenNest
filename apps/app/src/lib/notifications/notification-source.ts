import {
	type NotificationSwitches,
	notificationsFor,
} from "./notification-policy"
import type { NotificationPort } from "./notification-port"
import { notificationWordsFor } from "./notification-words"

import type { ChatState } from "../chat/chat-state"

type NotifiedBot = {
	id: string
	name: string
}

type ChatSource = {
	stateFor: (botId: string) => ChatState
	subscribe: (listener: () => void) => () => void
}

type RosterSource = {
	getState: () => { bots: NotifiedBot[] }
	select: (botId: string) => void
}

export type NotificationSourceOptions = {
	chat: ChatSource
	roster: RosterSource
	notifications: NotificationPort
	switches: () => NotificationSwitches
	hasFocus: () => boolean
	watchFocus: (report: (isFocused: boolean) => void) => Promise<() => void>
	raiseWindow: () => void
}

export const startNotificationSource = ({
	chat,
	roster,
	notifications,
	switches,
	hasFocus,
	watchFocus,
	raiseWindow,
}: NotificationSourceOptions): (() => void) => {
	const seen = new Map<string, ChatState>()

	let windowFocus: boolean | undefined

	const forget = (bots: NotifiedBot[]) => {
		for (const botId of seen.keys()) {
			if (!bots.some((bot) => bot.id === botId)) {
				seen.delete(botId)
			}
		}
	}

	const compare = () => {
		const { bots } = roster.getState()
		const currentSwitches = switches()
		const isFocused = windowFocus ?? hasFocus()

		for (const bot of bots) {
			const after = chat.stateFor(bot.id)
			const before = seen.get(bot.id)
			seen.set(bot.id, after)

			if (!before) {
				continue
			}

			const changes = notificationsFor({
				botId: bot.id,
				before,
				after,
				switches: currentSwitches,
				hasFocus: isFocused,
			})

			for (const change of changes) {
				void notifications.send({
					botId: bot.id,
					...notificationWordsFor({ botName: bot.name, event: change.event }),
				})
			}
		}

		if (seen.size > bots.length) {
			forget(bots)
		}
	}

	const activate = (botId: string) => {
		raiseWindow()

		if (roster.getState().bots.some((bot) => bot.id === botId)) {
			roster.select(botId)
		}
	}

	const stopChat = chat.subscribe(compare)
	const focus = watchFocus((isFocused) => {
		windowFocus = isFocused
	}).catch(() => undefined)
	const activation = notifications.onActivate(activate).catch(() => undefined)

	return () => {
		stopChat()
		void focus.then((stop) => stop?.())
		void activation.then((stop) => stop?.())
	}
}
