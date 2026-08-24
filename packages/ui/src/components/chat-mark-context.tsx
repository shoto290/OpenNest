"use client"

import { createContext, type ReactNode, useContext, useId } from "react"

interface ChatMarkProviderProps {
	children: ReactNode
}

const ChatMarkContext = createContext<string | undefined>(undefined)

function ChatMarkProvider({ children }: ChatMarkProviderProps) {
	const markId = useId()

	return (
		<ChatMarkContext.Provider value={markId}>
			{children}
		</ChatMarkContext.Provider>
	)
}

const useChatMarkId = () => useContext(ChatMarkContext)

export { ChatMarkProvider, type ChatMarkProviderProps, useChatMarkId }
