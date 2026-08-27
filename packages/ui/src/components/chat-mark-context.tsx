"use client"

import { createContext, type ReactNode, useContext, useId } from "react"

interface ChatMarkProviderProps {
	transcriptKey?: string
	children: ReactNode
}

const ChatMarkContext = createContext<string | undefined>(undefined)

function ChatMarkProvider({ transcriptKey, children }: ChatMarkProviderProps) {
	const mintedKey = useId()

	return (
		<ChatMarkContext.Provider value={`chat-mark-${transcriptKey ?? mintedKey}`}>
			{children}
		</ChatMarkContext.Provider>
	)
}

const useChatMarkId = (botId?: string) => {
	const transcriptKey = useContext(ChatMarkContext)

	return transcriptKey && botId ? `${transcriptKey}-${botId}` : undefined
}

export { ChatMarkProvider, type ChatMarkProviderProps, useChatMarkId }
