import type {
	AvatarBlot,
	Bot,
	BotHistoryEntry,
	BotIdentity,
	BotMcpServer,
	BotSkill,
	BotSkillDraft,
	Chat,
	ContextCheckpoint,
	MessagePin,
	MessageReference,
	NewAssistantMessage,
	NewTurn,
	NewUserMessage,
	RuntimeSession,
	Section,
	Space,
} from "./store-contract"
import type { TerminalCompletion } from "./transcript-contract"
import type { TranscriptPort } from "./transcript-port"

import type { AgentCommand } from "@/lib/agent/contract"

export type TranscriptStore = TranscriptPort & {
	spaces: () => Promise<Space[]>
	createSpace: (name: string) => Promise<Space>
	updateSpace: (id: string, name: string, colour: AvatarBlot) => Promise<Space>
	reorderSpaces: (ids: string[]) => Promise<void>
	deleteSpace: (id: string) => Promise<void>
	sections: (spaceId: string) => Promise<Section[]>
	createSection: (spaceId: string, name: string) => Promise<Section>
	renameSection: (id: string, name: string) => Promise<Section>
	reorderSections: (spaceId: string, ids: string[]) => Promise<void>
	deleteSection: (id: string) => Promise<void>
	moveBotToSection: (botId: string, sectionId: string | null) => Promise<void>
	moveBotToSpace: (botId: string, spaceId: string) => Promise<void>
	bots: (spaceId?: string | null) => Promise<Bot[]>
	createBot: (identity: BotIdentity, spaceId?: string | null) => Promise<Bot>
	duplicateBot: (botId: string, spaceId?: string | null) => Promise<Bot>
	updateBot: (id: string, identity: BotIdentity) => Promise<Bot>
	deleteBot: (id: string) => Promise<void>
	setBotAvatarImage: (id: string, bytes: Uint8Array) => Promise<Bot>
	setBotMemory: (id: string, memory: string) => Promise<Bot>
	botSkills: (botId: string) => Promise<BotSkill[]>
	createBotSkill: (botId: string, draft: BotSkillDraft) => Promise<BotSkill>
	updateBotSkill: (
		botId: string,
		skillId: string,
		draft: BotSkillDraft,
	) => Promise<BotSkill>
	setBotSkillPreloaded: (
		botId: string,
		skillId: string,
		isPreloaded: boolean,
	) => Promise<BotSkill>
	deleteBotSkill: (botId: string, skillId: string) => Promise<void>
	botMcpServers: (botId: string) => Promise<BotMcpServer[]>
	setBotMcpServer: (
		botId: string,
		name: string,
		config: Record<string, unknown>,
	) => Promise<BotMcpServer>
	deleteBotMcpServer: (botId: string, name: string) => Promise<void>
	botHistory: (botId: string) => Promise<BotHistoryEntry[]>
	botHistoryDiff: (botId: string, commitId: string) => Promise<string>
	revertBot: (botId: string, commitId: string) => Promise<BotHistoryEntry[]>
	userPluginSkills: () => Promise<BotSkill[]>
	createUserPluginSkill: (draft: BotSkillDraft) => Promise<BotSkill>
	updateUserPluginSkill: (
		skillId: string,
		draft: BotSkillDraft,
	) => Promise<BotSkill>
	setUserPluginSkillPreloaded: (
		skillId: string,
		isPreloaded: boolean,
	) => Promise<BotSkill>
	deleteUserPluginSkill: (skillId: string) => Promise<void>
	userPluginHistory: () => Promise<BotHistoryEntry[]>
	userPluginHistoryDiff: (commitId: string) => Promise<string>
	revertUserPlugin: (commitId: string) => Promise<BotHistoryEntry[]>
	spacePluginSkills: (spaceId: string) => Promise<BotSkill[]>
	createSpacePluginSkill: (
		spaceId: string,
		draft: BotSkillDraft,
	) => Promise<BotSkill>
	updateSpacePluginSkill: (
		spaceId: string,
		skillId: string,
		draft: BotSkillDraft,
	) => Promise<BotSkill>
	setSpacePluginSkillPreloaded: (
		spaceId: string,
		skillId: string,
		isPreloaded: boolean,
	) => Promise<BotSkill>
	deleteSpacePluginSkill: (spaceId: string, skillId: string) => Promise<void>
	spacePluginHistory: (spaceId: string) => Promise<BotHistoryEntry[]>
	spacePluginHistoryDiff: (spaceId: string, commitId: string) => Promise<string>
	revertSpacePlugin: (
		spaceId: string,
		commitId: string,
	) => Promise<BotHistoryEntry[]>
	recordBotCommands: (botId: string, commands: AgentCommand[]) => Promise<void>
	botCommands: (botId: string) => Promise<AgentCommand[]>
	mainChat: (botId: string) => Promise<Chat>
	openRuntimeSession: (
		conversationId: string,
		botId: string,
		startedAt: number,
		reason: string | null,
	) => Promise<RuntimeSession>
	recordProviderSession: (
		conversationId: string,
		botId: string,
		runtimeSessionId: string,
		providerSessionId: string,
	) => Promise<void>
	boundedContext: (
		conversationId: string,
		botId: string,
		promptMessageId: string,
	) => Promise<string>
	captureCheckpoint: (
		conversationId: string,
		botId: string,
		runtimeSessionId: string | null,
		createdAt: number,
	) => Promise<ContextCheckpoint | null>
	messageReference: (
		conversationId: string,
		messageId: string,
	) => Promise<MessageReference | null>
	pinMessage: (
		conversationId: string,
		messageId: string,
		blockIndex: number,
		pinnedAt: number,
	) => Promise<void>
	unpinMessage: (
		conversationId: string,
		messageId: string,
		blockIndex: number,
	) => Promise<void>
	pinnedMessages: (conversationId: string) => Promise<MessagePin[]>
	startTurn: (turn: NewTurn) => Promise<number>
	completeTurn: (id: string, completedAt: number) => Promise<void>
	appendUserMessage: (message: NewUserMessage) => Promise<number>
	openAssistantMessage: (message: NewAssistantMessage) => Promise<number>
	appendText: (id: string, delta: string) => Promise<void>
	finalizeMessage: (id: string, completion: TerminalCompletion) => Promise<void>
}
