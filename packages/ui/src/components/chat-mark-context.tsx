"use client"

import { createContext, type ReactNode, useContext, useId } from "react"

interface ChatMarkProviderProps {
	children: ReactNode
}

const ChatMarkContext = createContext<string | undefined>(undefined)

/** Names the one mark a transcript carries, so the places it can appear find
 * each other without a caller inventing an id and threading it to both. `useId`
 * holds for the provider's lifetime, so the value never changes identity and no
 * consumer re-renders on its account. */
function ChatMarkProvider({ children }: ChatMarkProviderProps) {
	const markId = useId()

	return (
		<ChatMarkContext.Provider value={markId}>
			{children}
		</ChatMarkContext.Provider>
	)
}

/** The transcript's mark identity, or undefined outside one — where a mark has
 * nowhere to travel and stays put. */
const useChatMarkId = () => useContext(ChatMarkContext)

export { ChatMarkProvider, type ChatMarkProviderProps, useChatMarkId }
