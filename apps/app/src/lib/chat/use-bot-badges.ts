import { useEffect, useState, useSyncExternalStore } from "react"

import type { BotBadge } from "./bot-badge"
import { createBotBadgeSource } from "./bot-badge-source"
import type { ChatController } from "./chat-controller"

import { watchWindowFocus } from "../host"
import type { RosterController } from "../bots/roster-controller"

export type BotBadgesMount = {
	chat: ChatController
	roster: RosterController
}

export const useBotBadges = ({
	chat,
	roster,
}: BotBadgesMount): Record<string, BotBadge> => {
	const [source] = useState(() =>
		createBotBadgeSource({
			chat,
			roster,
			hasFocus: () => document.hasFocus(),
			watchFocus: watchWindowFocus,
		}),
	)

	useEffect(() => source.start(), [source])

	return useSyncExternalStore(source.subscribe, source.getBadges)
}
