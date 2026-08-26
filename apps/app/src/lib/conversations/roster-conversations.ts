import type {
	AgentSidebarBot,
	AgentSidebarConversation,
} from "@workspace/ui/components/agents/agent-sidebar"
import type { ConversationBot } from "@workspace/ui/components/conversation-bots"
import type { ConversationSettingsValue } from "@workspace/ui/components/conversation-settings-dialog"
import type { MessageAuthor } from "@workspace/ui/components/message"

import type { Bot, Conversation, Participant } from "./store-contract"

import { avatarSrc } from "../host"

type BotFace = Pick<
	Bot,
	"name" | "avatarAnimal" | "avatarBlot" | "avatarImagePath"
>

const toBotRow = (id: string, face: BotFace): AgentSidebarBot => ({
	id,
	name: face.name,
	animal: face.avatarAnimal,
	blot: face.avatarBlot ?? undefined,
	image: avatarSrc(face.avatarImagePath),
})

const toParticipantRow = (participant: Participant): AgentSidebarBot =>
	toBotRow(participant.botId, participant)

const toAuthor = (participant: Participant): MessageAuthor => ({
	...toParticipantRow(participant),
	isLead: participant.role === "lead",
	isDeleted: participant.isDeleted,
})

export const toConversationBots = (
	participants: Participant[],
): ConversationBot[] => participants.map(toParticipantRow)

export const authorsOf = (
	conversation: Conversation,
): Map<string, MessageAuthor> =>
	new Map(
		conversation.participants.map((participant) => [
			participant.botId,
			toAuthor(participant),
		]),
	)

export const leadOf = (conversation: Conversation): string | undefined =>
	conversation.participants.find(
		(participant) => participant.role === "lead" && participant.leftAt === null,
	)?.botId

export const presentParticipants = (
	conversation: Conversation,
): Participant[] =>
	conversation.participants.filter((participant) => participant.leftAt === null)

export const unseatedBots = (
	bots: Bot[],
	conversation: Conversation,
): ConversationBot[] => {
	const seated = new Set(
		presentParticipants(conversation).map((participant) => participant.botId),
	)
	return bots
		.filter((bot) => !seated.has(bot.id))
		.map((bot) => toBotRow(bot.id, bot))
}

export const toConversationSettingsValue = (
	conversation: Conversation,
): ConversationSettingsValue => ({
	name: conversation.title,
	instructions: conversation.instructions,
})

export const toRosterConversations = (
	conversations: Conversation[],
): AgentSidebarConversation[] =>
	conversations.map((conversation) => ({
		id: conversation.id,
		name: conversation.title,
		sectionId: conversation.sectionId,
		participants: toConversationBots(presentParticipants(conversation)),
	}))
