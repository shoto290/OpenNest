import type {
	AgentSidebarBot,
	AgentSidebarConversation,
} from "@workspace/ui/components/agents/agent-sidebar"
import type { ConversationBot } from "@workspace/ui/components/conversation-bots"
import type { MessageAuthor } from "@workspace/ui/components/message"

import type { Conversation, Participant } from "./store-contract"

import { avatarSrc } from "../host"

const toParticipantRow = (participant: Participant): AgentSidebarBot => ({
	id: participant.botId,
	name: participant.name,
	animal: participant.avatarAnimal,
	blot: participant.avatarBlot ?? undefined,
	image: avatarSrc(participant.avatarImagePath),
})

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

export const toRosterConversations = (
	conversations: Conversation[],
): AgentSidebarConversation[] =>
	conversations.map((conversation) => ({
		id: conversation.id,
		name: conversation.title,
		sectionId: conversation.sectionId,
		participants: toConversationBots(presentParticipants(conversation)),
	}))
