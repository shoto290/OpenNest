import type {
	AgentSidebarBot,
	AgentSidebarConversation,
} from "@workspace/ui/components/agents/agent-sidebar"
import type { BotWorkingKind } from "@workspace/ui/components/bot-working"
import type { ConversationBot } from "@workspace/ui/components/conversation-bots"
import type { ConversationSettingsValue } from "@workspace/ui/components/conversation-settings-dialog"
import type { MessageAuthor } from "@workspace/ui/components/message"
import { i18n } from "@workspace/ui/lib/i18n"

import type { Bot, Conversation, Participant } from "./store-contract"
import type { ConversationPreviews, LastWord } from "./transcript-state"

import { avatarSrc } from "../host"
import { rosterTimestamp } from "../bots/roster-timestamp"

type BotFace = Pick<
	Bot,
	"name" | "avatarAnimal" | "avatarBlot" | "avatarImagePath"
>

export type ConversationWorker = {
	botId: string
	kind: BotWorkingKind
}

const NO_WORKERS: ConversationWorker[] = []

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
	conversation.participants.filter(
		(participant) => participant.leftAt === null && !participant.isDeleted,
	)

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

export const isNameless = (conversation: Conversation): boolean =>
	conversation.title.trim().length === 0

export const conversationName = (conversation: Conversation): string =>
	conversation.title.trim() ||
	presentParticipants(conversation)
		.map((participant) => participant.name)
		.join(i18n.t("chat:namelessConversation.separator")) ||
	i18n.t("chat:conversationSettings.untitled")

export const toConversationSettingsValue = (
	conversation: Conversation,
): ConversationSettingsValue => ({
	name: conversation.title,
	instructions: conversation.instructions,
})

export type ConversationRosterActivity = {
	working: Record<string, ConversationWorker[]>
	previews: ConversationPreviews
}

const lastSpokeAt = (
	conversation: Conversation,
	activity: ConversationRosterActivity,
): number => activity.previews[conversation.id]?.at ?? conversation.createdAt

const mostRecentFirst = (
	conversations: Conversation[],
	activity: ConversationRosterActivity,
): Conversation[] =>
	conversations.toSorted(
		(one, other) => lastSpokeAt(other, activity) - lastSpokeAt(one, activity),
	)

const speakerNameAmong = (
	seated: Participant[],
	preview: LastWord | undefined,
): string | undefined =>
	seated.find((participant) => participant.botId === preview?.authorBotId)?.name

const toSeatedRows = (
	seated: Participant[],
	workers: ConversationWorker[],
): AgentSidebarBot[] =>
	seated.map((participant) => {
		const worker = workers.find(({ botId }) => botId === participant.botId)
		return {
			...toParticipantRow(participant),
			status: worker ? "working" : "idle",
			pose: worker?.kind,
		}
	})

export const toRosterConversations = (
	conversations: Conversation[],
	activity: ConversationRosterActivity,
	now: number,
): AgentSidebarConversation[] =>
	mostRecentFirst(conversations, activity).map((conversation) => {
		const preview = activity.previews[conversation.id]
		const workers = activity.working[conversation.id] ?? NO_WORKERS
		const seated = presentParticipants(conversation)
		return {
			id: conversation.id,
			name: conversationName(conversation),
			sectionId: conversation.sectionId,
			participants: toSeatedRows(seated, workers),
			lastMessage: preview?.text,
			lastSpeaker: speakerNameAmong(seated, preview),
			timestamp: preview ? rosterTimestamp(preview.at, now) : undefined,
			status: workers.length > 0 ? "working" : "idle",
		}
	})
