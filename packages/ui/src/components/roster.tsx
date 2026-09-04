"use client"

import { createContext, type PropsWithChildren, useContext } from "react"

import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import type { BotAvatarBlot } from "@workspace/ui/components/bot-settings"

type RosterBot = {
	id: string
	name: string
	title?: string
	animal?: BotAvatarAnimal
	blot?: BotAvatarBlot
	image?: string
}

type RosterProviderProps = PropsWithChildren<{
	bots: RosterBot[]
}>

const NO_BOTS: RosterBot[] = []

const RosterContext = createContext<RosterBot[]>(NO_BOTS)

const RosterProvider = ({ bots, children }: RosterProviderProps) => (
	<RosterContext.Provider value={bots}>{children}</RosterContext.Provider>
)

const useRosterBot = (id: string) =>
	useContext(RosterContext).find((bot) => bot.id === id)

export {
	type RosterBot,
	RosterProvider,
	type RosterProviderProps,
	useRosterBot,
}
