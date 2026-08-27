import {
	type ConversationAnswer,
	conversationBadgeAfter,
} from "./conversation-badge"

import {
	type BadgeSource,
	createBadgeSource,
	rowIdsIn,
} from "../chat/badge-source"

type BadgedConversation = {
	id: string
}

type RuntimeSource = {
	heldFor: (
		conversationId: string,
	) => { getState: () => ConversationAnswer } | null
	subscribe: (listener: () => void) => () => void
}

type RosterSource = {
	getState: () => {
		conversationRosters: Record<string, BadgedConversation[]>
		selectedConversationId: string | null
	}
	subscribe: (listener: () => void) => () => void
}

export type ConversationBadgeSourceOptions = {
	runtimes: RuntimeSource
	roster: RosterSource
	hasFocus: () => boolean
	watchFocus: (report: (isFocused: boolean) => void) => Promise<() => void>
}

export const createConversationBadgeSource = ({
	runtimes,
	roster,
	hasFocus,
	watchFocus,
}: ConversationBadgeSourceOptions): BadgeSource =>
	createBadgeSource({
		states: {
			stateFor: (conversationId) =>
				runtimes.heldFor(conversationId)?.getState() ?? null,
			subscribe: runtimes.subscribe,
		},
		selection: {
			getState: () => {
				const { conversationRosters, selectedConversationId } =
					roster.getState()
				return {
					ids: rowIdsIn(conversationRosters),
					selectedId: selectedConversationId,
				}
			},
			subscribe: roster.subscribe,
		},
		ruleOf: conversationBadgeAfter,
		hasFocus,
		watchFocus,
	})
