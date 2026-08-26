import type {
	AgentSidebarBot,
	AgentSidebarConversation,
} from "@workspace/ui/components/agents/agent-sidebar"

import type { Conversation, Participant } from "./store-contract"

import { avatarSrc } from "../host"

const toParticipantRow = (participant: Participant): AgentSidebarBot => ({
	id: participant.botId,
	name: participant.name,
	animal: participant.avatarAnimal,
	blot: participant.avatarBlot ?? undefined,
	image: avatarSrc(participant.avatarImagePath),
})

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
		participants: presentParticipants(conversation).map(toParticipantRow),
	}))
