import type {
	AgentSidebarBot,
	AgentSidebarConversation,
} from "@workspace/ui/components/agents/agent-sidebar"
import type { ConversationBot } from "@workspace/ui/components/conversation-bots"
import type { ConversationSettingsValue } from "@workspace/ui/components/conversation-settings-dialog"
import type { MessageAuthor } from "@workspace/ui/components/message"

import type { Bot, Conversation, Participant } from "./store-contract"
import type { ConversationPreviews, LastWord } from "./transcript-state"

import { avatarSrc } from "../host"
import { rosterTimestamp } from "../bots/roster-timestamp"

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

const lastSpokeAt = (
	conversation: Conversation,
	previews: ConversationPreviews,
): number => previews[conversation.id]?.at ?? conversation.createdAt

const mostRecentFirst = (
	conversations: Conversation[],
	previews: ConversationPreviews,
): Conversation[] =>
	conversations.toSorted(
		(one, other) => lastSpokeAt(other, previews) - lastSpokeAt(one, previews),
	)

const speakerNameAmong = (
	seated: Participant[],
	preview: LastWord | undefined,
): string | undefined =>
	seated.find(
		(participant) =>
			participant.botId === preview?.authorBotId && !participant.isDeleted,
	)?.name

export const toRosterConversations = (
	conversations: Conversation[],
	previews: ConversationPreviews,
	now: number,
): AgentSidebarConversation[] =>
	mostRecentFirst(conversations, previews).map((conversation) => {
		const preview = previews[conversation.id]
		const seated = presentParticipants(conversation)
		return {
			id: conversation.id,
			name: conversation.title,
			sectionId: conversation.sectionId,
			participants: toConversationBots(seated),
			lastMessage: preview?.text,
			lastSpeaker: speakerNameAmong(seated, preview),
			timestamp: preview ? rosterTimestamp(preview.at, now) : undefined,
		}
	})
