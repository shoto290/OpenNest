import type { RosterController } from "./roster-controller"

import type { ChatController } from "../chat/chat-controller"
import type { SpacesController } from "../spaces/spaces-controller"

export type BotSpaceMove = {
	botId: string
	spaceId: string
	roster: Pick<RosterController, "moveToSpace">
	chat: Pick<ChatController, "close" | "open">
	spaces: Pick<SpacesController, "select">
}

export const moveBotToSpace = async ({
	botId,
	spaceId,
	roster,
	chat,
	spaces,
}: BotSpaceMove) => {
	const moved = await roster.moveToSpace(botId, spaceId)
	if (!moved) {
		return
	}
	await chat.close(botId)
	spaces.select(spaceId)
	await chat.open(botId)
}
