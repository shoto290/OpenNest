import type { BotPermissions } from "@workspace/ui/components/bot-settings"

import type { TranscriptMessage, TranscriptRole } from "./transcript-contract"

export type BotModel = string

export type AvatarAnimal =
	| "cat"
	| "rabbit"
	| "bear"
	| "chick"
	| "dog"
	| "mouse"
	| "owl"
	| "koala"

export type AvatarBlot =
	| "red"
	| "yellow"
	| "green"
	| "cyan"
	| "blue"
	| "purple"
	| "pink"
	| "orange"

export type BotIdentity = {
	name: string
	title: string
	model: BotModel
	avatarAnimal: AvatarAnimal
	avatarBlot: AvatarBlot | null
	avatarImagePath: string | null
	workingDir: string | null
	instructions: string
	deniedTools: string[]
	permissions: BotPermissions
	outputStyle: string
}

export type Bot = BotIdentity & {
	id: string
	createdAt: number
	changesNothing: boolean
	memory: string
	sectionId: string | null
	pinPosition: number | null
}

export type Space = {
	id: string
	name: string
	colour: AvatarBlot | null
	position: number
	createdAt: number
}

export type RosterPin = {
	id: string
	sectionId: string | null
}

export type Section = {
	id: string
	spaceId: string
	name: string
	position: number
	createdAt: number
}

export type SpacePreferences = {
	collapsedSectionIds: string[]
}

export type BotSkill = BotSkillFront & {
	id: string
	name: string
	description: string
	body: string
	isPreloaded: boolean
	isSystem: boolean
}

export type BotSkillValue =
	| string
	| number
	| boolean
	| null
	| BotSkillValue[]
	| { [key: string]: BotSkillValue }

export type BotSkillFront = {
	whenToUse: string | null
	argumentHint: string | null
	arguments: string[] | null
	disableModelInvocation: boolean | null
	userInvocable: boolean | null
	allowedTools: string[] | null
	disallowedTools: string[] | null
	model: string | null
	effort: string | null
	context: string | null
	agent: string | null
	background: boolean | null
	hooks: BotSkillValue
	paths: string[] | null
	shell: string | null
	metadata: BotSkillValue
	license: string | null
	compatibility: BotSkillValue
}

export type BotSkillDraft = Partial<BotSkillFront> & {
	name: string
	description: string
	body: string
}

export type BotMcpServer = {
	name: string
	config: Record<string, unknown>
}

export type BotHistoryAuthor = "user" | "bot"

export type BotHistoryEntry = {
	id: string
	timestamp: number
	author: BotHistoryAuthor
	title: string
	body: string
}

export type Chat = { id: string; createdAt: number; updatedAt: number }

export type ParticipantRole = "lead" | "assistant"

export type Participant = {
	botId: string
	role: ParticipantRole
	joinedAt: number
	leftAt: number | null
	name: string
	avatarAnimal: AvatarAnimal
	avatarBlot: AvatarBlot | null
	avatarImagePath: string | null
	isDeleted: boolean
}

export type Conversation = {
	id: string
	spaceId: string | null
	sectionId: string | null
	pinPosition: number | null
	title: string
	instructions: string
	createdAt: number
	updatedAt: number
	participants: Participant[]
}

export type ConversationDraft = {
	spaceId: string
	sectionId: string | null
	title: string
	botIds: string[]
}

export type ConversationEdit = {
	title: string
	instructions: string
	sectionId: string | null
}

export type RuntimeSession = {
	id: string
	conversationId: string
	botId: string
	seq: number
	startedAt: number
}

export type ContextCheckpoint = {
	id: string
	conversationId: string
	botId: string
	runtimeSessionId: string | null
	lastMessageSeq: number
	tokenCount: number
	createdAt: number
}

export type NewTurn = { id: string; conversationId: string; startedAt: number }

export type NewUserMessage = {
	id: string
	conversationId: string
	turnId: string
	authorBotId: string | null
	repliedToMessageId: string | null
	content: string
	createdAt: number
}

export type NewAssistantMessage = {
	id: string
	conversationId: string
	turnId: string
	authorBotId: string | null
	repliedToMessageId: string | null
	createdAt: number
}

export type MessageReference = {
	uri: string
	conversationId: string
	messageId: string
	role: TranscriptRole
	seq: number
	createdAt: number
	excerpt: string
	runtimeSessionId: string | null
	providerSessionId: string | null
}

export type MessagePin = {
	message: TranscriptMessage
	blockIndex: number
	pinnedAt: number
}

export type StorageFailure =
	| { kind: "appDataDir" }
	| { kind: "journalMode"; mode: string }
	| { kind: "poisonedConnection" }
	| { kind: "callInterrupted" }
	| { kind: "staleWrite" }
	| { kind: "sqlite"; detail: string }

export type AvatarRejection =
	| { kind: "unknownFormat" }
	| { kind: "tooLarge"; bytes: number; limit: number }
	| { kind: "undecodable"; detail: string }
	| { kind: "unwritable"; detail: string }

export type TranscriptStoreError =
	| { kind: "unavailable"; failure: StorageFailure }
	| { kind: "storage"; failure: StorageFailure }
	| { kind: "conflict"; id: string; field: string }
	| { kind: "invalidTransition"; id: string; from: string; to: string }
	| { kind: "unknownBot"; id: string }
	| { kind: "unknownConversation"; id: string }
	| { kind: "rejectedAvatarImage"; reason: AvatarRejection }
	| { kind: "unwritableBundle"; detail: string }
	| { kind: "systemSkill"; id: string }
	| { kind: "unreadableHistory"; detail: string }

export type SpaceError =
	| { kind: "unavailable"; failure: StorageFailure }
	| { kind: "storage"; failure: StorageFailure }
	| { kind: "unknownSpace"; id: string }
	| { kind: "lastSpace" }

export type SectionError =
	| { kind: "unavailable"; failure: StorageFailure }
	| { kind: "storage"; failure: StorageFailure }
	| { kind: "unknownSection"; id: string }
	| { kind: "unknownBot"; id: string }
	| { kind: "foreignSection"; id: string }
