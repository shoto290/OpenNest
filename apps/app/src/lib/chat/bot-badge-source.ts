import { type BadgeSource, createBadgeSource, rowIdsIn } from "./badge-source"
import { badgeAfter } from "./bot-badge"
import type { ChatState } from "./chat-state"

type BadgedBot = {
	id: string
}

type ChatSource = {
	stateFor: (botId: string) => ChatState
	subscribe: (listener: () => void) => () => void
}

type RosterSource = {
	getState: () => {
		rosters: Record<string, BadgedBot[]>
		selectedBotId: string | null
	}
	subscribe: (listener: () => void) => () => void
}

export type BotBadgeSourceOptions = {
	chat: ChatSource
	roster: RosterSource
	hasFocus: () => boolean
	watchFocus: (report: (isFocused: boolean) => void) => Promise<() => void>
}

export const createBotBadgeSource = ({
	chat,
	roster,
	hasFocus,
	watchFocus,
}: BotBadgeSourceOptions): BadgeSource =>
	createBadgeSource({
		states: chat,
		selection: {
			getState: () => {
				const { rosters, selectedBotId } = roster.getState()
				return { ids: rowIdsIn(rosters), selectedId: selectedBotId }
			},
			subscribe: roster.subscribe,
		},
		ruleOf: badgeAfter,
		hasFocus,
		watchFocus,
	})
