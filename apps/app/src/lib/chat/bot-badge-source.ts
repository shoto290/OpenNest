import { type BotBadge, badgeAfter } from "./bot-badge"
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

export type BotBadgeSource = {
	getBadges: () => Record<string, BotBadge>
	subscribe: (listener: () => void) => () => void
	start: () => () => void
}

export const createBotBadgeSource = ({
	chat,
	roster,
	hasFocus,
	watchFocus,
}: BotBadgeSourceOptions): BotBadgeSource => {
	const seen = new Map<string, ChatState>()
	const listeners = new Set<() => void>()

	let badges: Record<string, BotBadge> = {}
	let selectedBotId: string | null = null
	let windowFocus: boolean | undefined

	const publish = () => {
		for (const listener of [...listeners]) {
			listener()
		}
	}

	const botIdsIn = (rosters: Record<string, BadgedBot[]>): string[] =>
		Object.values(rosters).flatMap((bots) => bots.map((bot) => bot.id))

	const forget = (botIds: string[]) => {
		for (const botId of seen.keys()) {
			if (!botIds.includes(botId)) {
				seen.delete(botId)
			}
		}
	}

	const hasChanged = (next: Record<string, BotBadge>): boolean => {
		const keys = Object.keys(next)
		return (
			keys.length !== Object.keys(badges).length ||
			keys.some((botId) => next[botId] !== badges[botId])
		)
	}

	const refresh = (cleared: string | null = null) => {
		const botIds = botIdsIn(roster.getState().rosters)
		const isFocused = windowFocus ?? hasFocus()
		const next: Record<string, BotBadge> = {}

		for (const botId of botIds) {
			const after = chat.stateFor(botId)
			next[botId] = badgeAfter({
				held: botId === cleared ? "none" : (badges[botId] ?? "none"),
				before: seen.get(botId),
				after,
				isSelected: botId === selectedBotId,
				hasFocus: isFocused,
			})
			seen.set(botId, after)
		}

		forget(botIds)

		if (!hasChanged(next)) {
			return
		}
		badges = next
		publish()
	}

	const followFocus = (isFocused: boolean) => {
		windowFocus = isFocused
		if (isFocused) {
			refresh()
		}
	}

	const followSelection = () => {
		const selected = roster.getState().selectedBotId
		if (selected === selectedBotId) {
			refresh()
			return
		}
		selectedBotId = selected
		refresh(selected)
	}

	return {
		getBadges: () => badges,
		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		start: () => {
			const stopChat = chat.subscribe(refresh)
			const stopRoster = roster.subscribe(followSelection)
			const focus = watchFocus(followFocus).catch(() => undefined)

			followSelection()

			return () => {
				stopChat()
				stopRoster()
				void focus.then((stop) => stop?.())
			}
		},
	}
}
