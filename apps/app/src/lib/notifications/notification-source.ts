import type { NoticeMessage } from "@workspace/ui/components/notice-surface"

import {
	type ConversationRound,
	type NotificationSwitches,
	notificationsFor,
	notifiesFinishedRound,
} from "./notification-policy"
import type {
	NotificationPort,
	NotificationRequest,
	NotificationTarget,
} from "./notification-port"
import {
	type NotificationFailure,
	notificationFailureTitleFor,
	notificationWordsFor,
} from "./notification-words"

import type { ChatState } from "../chat/chat-state"
import { conversationName } from "../conversations/roster-conversations"
import type { Conversation } from "../conversations/store-contract"
import type { UserPreferences } from "../user/preferences-contract"

type NotifiedBot = {
	id: string
	name: string
}

type ChatSource = {
	stateFor: (botId: string) => ChatState
	subscribe: (listener: () => void) => () => void
}

type RuntimeSource = {
	heldFor: (
		conversationId: string,
	) => { getState: () => ConversationRound } | null
	subscribe: (listener: () => void) => () => void
}

type RosterSource = {
	getState: () => { bots: NotifiedBot[]; conversations: Conversation[] }
	spaceOfBot: (botId: string) => string | undefined
	spaceOfConversation: (conversationId: string) => string | undefined
	select: (botId: string) => void
	selectConversation: (conversationId: string) => void
}

type SpacesSource = {
	select: (spaceId: string) => void
}

export type NotificationSourceSwitches = NotificationSwitches &
	Pick<UserPreferences, "notifyWithSound">

export type FailureNoticeReporter = (notice: NoticeMessage) => void

export type NotificationSourceOptions = {
	chat: ChatSource
	runtimes: RuntimeSource
	roster: RosterSource
	spaces: SpacesSource
	notifications: NotificationPort
	switches: () => NotificationSourceSwitches
	hasFocus: () => boolean
	watchFocus: (report: (isFocused: boolean) => void) => Promise<() => void>
	raiseWindow: () => Promise<void>
	playChime: () => void
	reportFailure: FailureNoticeReporter
}

type Reading = {
	switches: NotificationSourceSwitches
	hasFocus: boolean
}

const reasonOf = (reason: unknown): string =>
	reason instanceof Error ? reason.message : String(reason)

const forgetBeyond = <Held>(seen: Map<string, Held>, ids: string[]) => {
	if (seen.size <= ids.length) {
		return
	}
	for (const id of seen.keys()) {
		if (!ids.includes(id)) {
			seen.delete(id)
		}
	}
}

export const startNotificationSource = ({
	chat,
	runtimes,
	roster,
	spaces,
	notifications,
	switches,
	hasFocus,
	watchFocus,
	raiseWindow,
	playChime,
	reportFailure,
}: NotificationSourceOptions): (() => void) => {
	const seen = new Map<string, ChatState>()
	const seenRounds = new Map<string, ConversationRound>()

	let windowFocus: boolean | undefined

	const reportedFailures = new Set<NotificationFailure>()

	const failWith =
		(failure: NotificationFailure) =>
		(reason: unknown): undefined => {
			if (reportedFailures.has(failure)) {
				return
			}
			reportedFailures.add(failure)
			reportFailure({
				title: notificationFailureTitleFor(failure),
				description: reasonOf(reason),
			})
		}

	const botNotifications = ({
		switches,
		hasFocus,
	}: Reading): NotificationRequest[] => {
		const { bots } = roster.getState()
		const requests: NotificationRequest[] = []

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
				switches,
				hasFocus,
			})

			for (const change of changes) {
				requests.push({
					target: { kind: "bot", id: bot.id },
					...notificationWordsFor({ name: bot.name, event: change.event }),
				})
			}
		}

		forgetBeyond(
			seen,
			bots.map((bot) => bot.id),
		)
		return requests
	}

	const conversationNotifications = ({
		switches,
		hasFocus,
	}: Reading): NotificationRequest[] => {
		const { conversations } = roster.getState()
		const requests: NotificationRequest[] = []

		for (const conversation of conversations) {
			const held = runtimes.heldFor(conversation.id)

			if (!held) {
				seenRounds.delete(conversation.id)
				continue
			}

			const after = held.getState()
			const before = seenRounds.get(conversation.id)
			seenRounds.set(conversation.id, after)

			if (
				before &&
				notifiesFinishedRound({ before, after, switches, hasFocus })
			) {
				requests.push({
					target: { kind: "conversation", id: conversation.id },
					...notificationWordsFor({
						name: conversationName(conversation),
						event: "finishedTurn",
					}),
				})
			}
		}

		forgetBeyond(
			seenRounds,
			conversations.map((conversation) => conversation.id),
		)
		return requests
	}

	const compare = () => {
		const reading: Reading = {
			switches: switches(),
			hasFocus: windowFocus ?? hasFocus(),
		}
		const requests = [
			...botNotifications(reading),
			...conversationNotifications(reading),
		]

		for (const request of requests) {
			void notifications.send(request).catch(failWith("send"))
		}

		if (requests.length > 0 && reading.switches.notifyWithSound) {
			playChime()
		}
	}

	const activate = ({ kind, id }: NotificationTarget) => {
		void raiseWindow().catch(failWith("reveal"))

		const spaceId =
			kind === "bot" ? roster.spaceOfBot(id) : roster.spaceOfConversation(id)

		if (!spaceId) {
			return
		}

		if (kind === "bot") {
			roster.select(id)
		} else {
			roster.selectConversation(id)
		}

		spaces.select(spaceId)
	}

	const stopChat = chat.subscribe(compare)
	const stopRuntimes = runtimes.subscribe(compare)
	const focus = watchFocus((isFocused) => {
		windowFocus = isFocused
	}).catch(failWith("focus"))
	const activation = notifications
		.onActivate(activate)
		.catch(failWith("clicks"))

	return () => {
		stopChat()
		stopRuntimes()
		void focus.then((stop) => stop?.())
		void activation.then((stop) => stop?.())
	}
}
