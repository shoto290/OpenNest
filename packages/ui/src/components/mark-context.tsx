"use client"

import { createContext, type ReactNode, useContext, useId } from "react"

interface MarkProviderProps {
	transcriptKey?: string
	children: ReactNode
}

const MarkContext = createContext<string | undefined>(undefined)

function MarkProvider({ transcriptKey, children }: MarkProviderProps) {
	const mintedKey = useId()

	return (
		<MarkContext.Provider value={`chat-mark-${transcriptKey ?? mintedKey}`}>
			{children}
		</MarkContext.Provider>
	)
}

const useMarkId = (botId?: string) => {
	const transcriptKey = useContext(MarkContext)

	return transcriptKey && botId ? `${transcriptKey}-${botId}` : undefined
}

export { MarkProvider, type MarkProviderProps, useMarkId }
