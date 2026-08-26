"use client"

import { createContext, type PropsWithChildren, useContext } from "react"

import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import type { BotAvatarBlot } from "@workspace/ui/components/bot-settings"

type ConversationBot = {
	id: string
	name: string
	animal?: BotAvatarAnimal
	blot?: BotAvatarBlot
	image?: string
}

type ConversationBotsProviderProps = PropsWithChildren<{
	bots: ConversationBot[]
}>

const NO_BOTS: ConversationBot[] = []

const ConversationBotsContext = createContext<ConversationBot[]>(NO_BOTS)

const ConversationBotsProvider = ({
	bots,
	children,
}: ConversationBotsProviderProps) => (
	<ConversationBotsContext.Provider value={bots}>
		{children}
	</ConversationBotsContext.Provider>
)

const useConversationBot = (id: string) =>
	useContext(ConversationBotsContext).find((bot) => bot.id === id)

export {
	type ConversationBot,
	ConversationBotsProvider,
	type ConversationBotsProviderProps,
	useConversationBot,
}
