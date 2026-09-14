import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import type { RosterBot } from "@workspace/ui/components/roster"
import { i18n } from "@workspace/ui/lib/i18n"

import { toBotRows } from "./roster-conversations"
import type { Bot } from "./store-contract"

export type ConversationSeating = {
	seat: (conversationId: string, botId: string) => Promise<boolean>
	botsByPresence: (conversationId: string) => Promise<Bot[]>
}

export const ConversationSeatingContext =
	createContext<ConversationSeating | null>(null)

const NO_BOTS: RosterBot[] = []

export const useSeatInConversation = (
	conversationId: string | null,
): ((botId: string) => Promise<boolean>) | undefined => {
	const seating = useContext(ConversationSeatingContext)

	const seat = useCallback(
		(botId: string) =>
			seating && conversationId
				? seating.seat(conversationId, botId)
				: Promise.resolve(false),
		[seating, conversationId],
	)

	return seating && conversationId ? seat : undefined
}

export const useBotsByPresence = (conversationId: string | null) => {
	const seating = useContext(ConversationSeatingContext)
	const [read, setRead] = useState<{
		conversationId: string
		bots: RosterBot[]
	} | null>(null)

	useEffect(() => {
		if (!seating || !conversationId) {
			return
		}
		let isCurrent = true
		const land = (bots: RosterBot[]) => {
			if (isCurrent) {
				setRead({ conversationId, bots })
			}
		}
		seating.botsByPresence(conversationId).then(
			(bots) => land(toBotRows(bots)),
			() => {
				land(NO_BOTS)
				raiseFailureNotice({
					title: i18n.t("chat:conversationSeating.unavailable"),
				})
			},
		)
		return () => {
			isCurrent = false
		}
	}, [seating, conversationId])

	return read?.conversationId === conversationId ? read.bots : NO_BOTS
}
