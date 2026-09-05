import type {
	MissionBot,
	MissionEventModel,
} from "@workspace/ui/components/mission"

import type { Mission } from "./mission-contract"

import { faceOfBot, type ThreadFace } from "@/lib/chat/thread-contract"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import type { TranscriptMessage } from "@/lib/conversations/transcript-contract"

type MissionSeat = {
	mission: Mission
	bot: Bot
}

type SpokenSources = {
	reader: string
	bot: string
}

type MissionThreadRead = {
	events: MissionEventModel[]
	messages: TranscriptMessage[]
	sources: SpokenSources
}

export const toMissionFace = ({ id, ...face }: ThreadFace): MissionBot => ({
	...face,
	seed: id,
})

export const toMissionBot = (bot: Bot): MissionBot =>
	toMissionFace(faceOfBot(bot))

export const toMissionConversation = ({
	mission,
	bot,
}: MissionSeat): Conversation => ({
	id: mission.threadConversationId,
	spaceId: null,
	sectionId: null,
	pinPosition: null,
	title: mission.objective,
	instructions: "",
	createdAt: mission.openedAt,
	updatedAt: mission.openedAt,
	participants: [
		{
			botId: bot.id,
			role: "lead",
			joinedAt: mission.openedAt,
			leftAt: null,
			name: bot.name,
			avatarAnimal: bot.avatarAnimal,
			avatarBlot: bot.avatarBlot,
			avatarImagePath: bot.avatarImagePath,
			isDeleted: false,
		},
	],
})

const toSpokenEvent = (
	message: TranscriptMessage,
	sources: SpokenSources,
): MissionEventModel => ({
	id: message.id,
	kind: message.role === "user" ? "answered" : "note",
	source: message.role === "user" ? sources.reader : sources.bot,
	createdAt: message.createdAt,
	text: message.content,
})

export const toMissionThreadEvents = ({
	events,
	messages,
	sources,
}: MissionThreadRead): MissionEventModel[] =>
	[
		...events,
		...messages.map((message) => toSpokenEvent(message, sources)),
	].sort((one, other) => one.createdAt - other.createdAt)
