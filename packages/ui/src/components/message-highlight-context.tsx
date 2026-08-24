"use client"

import { createContext, type ReactNode, useContext } from "react"

interface MessageHighlightProviderProps {
	messageId?: string
	children: ReactNode
}

const MessageHighlightContext = createContext<string | undefined>(undefined)

function MessageHighlightProvider({
	messageId,
	children,
}: MessageHighlightProviderProps) {
	return (
		<MessageHighlightContext.Provider value={messageId}>
			{children}
		</MessageHighlightContext.Provider>
	)
}

const useMessageAnchor = (messageId?: string) => {
	const highlightedMessageId = useContext(MessageHighlightContext)

	return {
		"data-message-id": messageId,
		"data-highlighted":
			messageId !== undefined && highlightedMessageId === messageId
				? true
				: undefined,
	}
}

export {
	MessageHighlightProvider,
	type MessageHighlightProviderProps,
	useMessageAnchor,
}
