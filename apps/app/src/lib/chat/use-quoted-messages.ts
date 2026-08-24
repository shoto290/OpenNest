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

const NO_QUOTES: Quotes = new Map()

export function useQuotedMessages(
	controller: ChatController,
	messages: TranscriptMessage[],
): Quotes {
	const [recalled, setRecalled] = useState<Quotes>(NO_QUOTES)
	const asked = useRef(new Set<string>())

	const wanted = useMemo(() => quotedMessageIdsIn(messages), [messages])
	const loaded = useMemo(
		() => quotedTargetsIn(messages, wanted),
		[messages, wanted],
	)
	useEffect(() => {
		for (const messageId of wanted) {
			if (loaded.has(messageId) || asked.current.has(messageId)) {
				continue
			}
			asked.current.add(messageId)
			void controller.reference(messageId).then(
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
	}, [controller, wanted, loaded])

	return useMemo(
		() => (recalled.size === 0 ? loaded : new Map([...recalled, ...loaded])),
		[recalled, loaded],
	)
}
