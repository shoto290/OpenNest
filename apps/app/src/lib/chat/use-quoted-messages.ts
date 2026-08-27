import { useEffect, useMemo, useRef, useState } from "react"

import type { ChatController } from "./chat-controller"
import {
	quotedMessageIdsIn,
	quotedTargetsIn,
	type ReplyTarget,
	replyTargetOfReference,
} from "./screen-model"

import type { TranscriptMessage } from "../conversations/transcript-contract"

type Quotes = ReadonlyMap<string, ReplyTarget>

export type QuoteSource = Pick<ChatController, "reference">

const NO_QUOTES: Quotes = new Map()

export const NO_QUOTED_IDS: string[] = []

export function useQuotedMessages(
	source: QuoteSource | null,
	messages: TranscriptMessage[],
	also: string[] = NO_QUOTED_IDS,
): Quotes {
	const [recalled, setRecalled] = useState<Quotes>(NO_QUOTES)
	const asked = useRef(new Set<string>())

	const wanted = useMemo(() => {
		const quoted = quotedMessageIdsIn(messages)
		return also.length === 0 ? quoted : [...new Set([...quoted, ...also])]
	}, [messages, also])
	const loaded = useMemo(
		() => quotedTargetsIn(messages, wanted),
		[messages, wanted],
	)
	useEffect(() => {
		if (!source) {
			return
		}
		for (const messageId of wanted) {
			if (loaded.has(messageId) || asked.current.has(messageId)) {
				continue
			}
			asked.current.add(messageId)
			void source.reference(messageId).then(
				(reference) => {
					if (reference) {
						setRecalled((held) =>
							new Map(held).set(
								reference.messageId,
								replyTargetOfReference(reference),
							),
						)
					}
				},
				() => undefined,
			)
		}
	}, [source, wanted, loaded])

	return useMemo(
		() => (recalled.size === 0 ? loaded : new Map([...recalled, ...loaded])),
		[recalled, loaded],
	)
}
