import {
	type NotificationSwitches,
	notificationsFor,
} from "./notification-policy"
import type { NotificationPort } from "./notification-port"
import { notificationWordsFor } from "./notification-words"

import type { ChatState } from "../chat/chat-state"

/** All the source needs of a bot: which conversation it is, and the name a
 * notification is titled with. */
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

/** Everything the source reads from outside itself, handed in rather than reached
 * for: the switches as the record holds them now, the focus as the window has it
 * now, and the window coming back to the front. */
export type NotificationSourceOptions = {
	chat: ChatSource
	roster: RosterSource
	notifications: NotificationPort
	switches: () => NotificationSwitches
	hasFocus: () => boolean
	raiseWindow: () => void
}

/** Where a state change becomes a notification, and a click becomes a conversation.
 *
 * Every bot on the roster is compared at every publish, not only the selected one:
 * the reader is told about the bot that answered, which is precisely the one they are
 * not looking at. A bot seen for the first time is only recorded — there is no state
 * before it to compare against, and a launch reading the roster in would otherwise
 * announce every bot it found. A bot the roster no longer holds is dropped with it.
 *
 * The decision itself is `notificationsFor`'s, the words are the catalogues', and
 * what the platform does with either is the port's. */
export const startNotificationSource = ({
	chat,
	roster,
	notifications,
	switches,
	hasFocus,
	raiseWindow,
}: NotificationSourceOptions): (() => void) => {
	const seen = new Map<string, ChatState>()

	/** The bots the roster let go of, dropped from what is compared. Only reached
	 * when the roster is shorter than what is held: this runs on every word of every
	 * answer, and a walk per token is the kind of work a stream multiplies. */
	const forget = (bots: NotifiedBot[]) => {
		for (const botId of seen.keys()) {
			if (!bots.some((bot) => bot.id === botId)) {
				seen.delete(botId)
			}
		}
	}

	const compare = () => {
		const { bots } = roster.getState()
		// Read once for the whole publish rather than per bot: every bot is being told
		// about the same moment, with the same switches and the same window.
		const currentSwitches = switches()
		const isFocused = hasFocus()

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

	/** The reader answering a notification: the window comes back whether or not the
	 * bot is still there, and only a bot the roster still holds is opened. */
	const activate = (botId: string) => {
		raiseWindow()

		if (roster.getState().bots.some((bot) => bot.id === botId)) {
			roster.select(botId)
		}
	}

	const stopChat = chat.subscribe(compare)
	// The promise is what is held rather than what it answers with: the host
	// registers the listener over IPC, so a dispose that lands first still has
	// something to unsubscribe once the registration settles.
	const activation = notifications.onActivate(activate).catch(() => undefined)

	return () => {
		stopChat()
		void activation.then((stop) => stop?.())
	}
}
