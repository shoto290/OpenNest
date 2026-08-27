import { useEffect, useState, useSyncExternalStore } from "react"

import { createConversationBadgeSource } from "./conversation-badge-source"
import type { ConversationRuntimes } from "./conversation-runtimes"

import { watchWindowFocus } from "../host"
import type { RosterController } from "../bots/roster-controller"
import type { BotBadge } from "../chat/bot-badge"

export type ConversationBadgesMount = {
	runtimes: ConversationRuntimes
	roster: RosterController
}

export const useConversationBadges = ({
	runtimes,
	roster,
}: ConversationBadgesMount): Record<string, BotBadge> => {
	const [source] = useState(() =>
		createConversationBadgeSource({
			runtimes,
			roster,
			hasFocus: () => document.hasFocus(),
			watchFocus: watchWindowFocus,
		}),
	)

	useEffect(() => source.start(), [source])

	return useSyncExternalStore(source.subscribe, source.getBadges)
}
