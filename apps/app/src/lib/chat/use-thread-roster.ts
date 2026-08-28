import { useCallback, useMemo } from "react"

import type { QuotedMessage } from "@workspace/ui/components/message-quote"
import type { RosterBot } from "@workspace/ui/components/roster"

import type { ReplyTarget } from "./screen-model"
import {
	faceOfBot,
	type ThreadAuthors,
	type ThreadFace,
} from "./thread-contract"

import { toMentionNames } from "../conversations/mentions"
import {
	authorsOf,
	presentParticipants,
	toConversationBots,
} from "../conversations/roster-conversations"
import type { Bot, Conversation } from "../conversations/store-contract"

const NO_BOTS: RosterBot[] = []

const NO_AUTHORS: ThreadAuthors = new Map()

export type ThreadRoster = {
	bots: RosterBot[]
	present: RosterBot[]
	authors: ThreadAuthors
	botFace: ThreadFace | null
}

type ThreadSeats = {
	bot: Bot | null
	conversation: Conversation | null
}

export function useThreadRoster({
	bot,
	conversation,
}: ThreadSeats): ThreadRoster {
	const bots = useMemo(
		() =>
			conversation ? toConversationBots(conversation.participants) : NO_BOTS,
		[conversation],
	)
	const present = useMemo(
		() =>
			conversation
				? toConversationBots(presentParticipants(conversation))
				: NO_BOTS,
		[conversation],
	)
	const authors = useMemo<ThreadAuthors>(
		() => (conversation ? authorsOf(conversation) : NO_AUTHORS),
		[conversation],
	)
	const botFace = useMemo<ThreadFace | null>(
		() => (bot ? faceOfBot(bot) : null),
		[bot],
	)

	return { bots, present, authors, botFace }
}

export type ThreadNaming = {
	faceOf: (authorBotId: string | null) => ThreadFace | undefined
	toExcerpt: (text: string) => string
	toQuote: (target: ReplyTarget) => QuotedMessage
}

type ThreadNamingInput = ThreadRoster & {
	reader: string
	unnamed: string
	isConversation: boolean
	onJump: (messageId: string) => void
}

export function useThreadNaming({
	bots,
	authors,
	botFace,
	reader,
	unnamed,
	isConversation,
	onJump,
}: ThreadNamingInput): ThreadNaming {
	const faceOf = useCallback(
		(authorBotId: string | null) =>
			botFace ?? (authorBotId ? authors.get(authorBotId) : undefined),
		[botFace, authors],
	)

	const toExcerpt = useCallback(
		(text: string) => (isConversation ? toMentionNames(text, bots) : text),
		[isConversation, bots],
	)

	const nameOf = useCallback(
		(authorBotId: string | null) => faceOf(authorBotId)?.name ?? unnamed,
		[faceOf, unnamed],
	)

	const toQuote = useCallback(
		(target: ReplyTarget): QuotedMessage => ({
			author: target.role === "user" ? reader : nameOf(target.authorBotId),
			excerpt: toExcerpt(target.excerpt),
			from: target.role,
			onJump: () => onJump(target.messageId),
		}),
		[reader, nameOf, toExcerpt, onJump],
	)

	return { faceOf, toExcerpt, toQuote }
}
