import { useCallback, useState } from "react"

type Send = (text: string, repliedToMessageId?: string) => Promise<boolean>

type SentInMountInput = {
	threadId: string
	messages: readonly { id: string }[]
	send: Send
}

type SentMark = {
	threadId: string
	priorMessageIds: ReadonlySet<string>
}

export type SentInMount = {
	send: Send
	isSentInMount: (messageId: string) => boolean
}

export const useSentInMount = ({
	threadId,
	messages,
	send,
}: SentInMountInput): SentInMount => {
	const [mark, setMark] = useState<SentMark | null>(null)

	if (mark && mark.threadId !== threadId) {
		setMark(null)
	}

	const markedSend = useCallback<Send>(
		(text, repliedToMessageId) => {
			setMark({
				threadId,
				priorMessageIds: new Set(messages.map(({ id }) => id)),
			})
			return send(text, repliedToMessageId)
		},
		[threadId, messages, send],
	)

	const isSentInMount = useCallback(
		(messageId: string) =>
			mark?.threadId === threadId && !mark.priorMessageIds.has(messageId),
		[mark, threadId],
	)

	return { send: markedSend, isSentInMount }
}
