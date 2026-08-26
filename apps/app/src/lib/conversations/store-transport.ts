import { invoke } from "@tauri-apps/api/core"

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
	Conversation,
	ConversationDraft,
	ConversationEdit,
	MessagePin,
	MessageReference,
	NewAssistantMessage,
	NewTurn,
	NewUserMessage,
	RuntimeSession,
	Section,
	Space,
} from "./store-contract"
import type { TranscriptStore } from "./store-port"
import {
	type TerminalCompletion,
	TRANSCRIPT_PAGE_SIZE,
	type TranscriptCursor,
	type TranscriptPage,
} from "./transcript-contract"

import type { AgentCommand } from "@/lib/agent/contract"

export const conversationStore: TranscriptStore = {
	loadPage: (conversationId: string, cursor: TranscriptCursor | null) =>
		invoke<TranscriptPage>("conversation_message_page", {
			conversationId,
			beforeSeq: cursor?.beforeSeq ?? null,
			limit: TRANSCRIPT_PAGE_SIZE,
		}),

	spaces: () => invoke<Space[]>("space_list"),

	createSpace: (name: string) => invoke<Space>("space_create", { name }),

	updateSpace: (id: string, name: string, colour: AvatarBlot) =>
		invoke<Space>("space_update", { id, name, colour }),

	reorderSpaces: (ids: string[]) => invoke<void>("space_reorder", { ids }),

	deleteSpace: (id: string) => invoke<void>("space_delete", { id }),

	sections: (spaceId: string) => invoke<Section[]>("section_list", { spaceId }),

	createSection: (spaceId: string, name: string) =>
		invoke<Section>("section_create", { spaceId, name }),

	renameSection: (id: string, name: string) =>
		invoke<Section>("section_rename", { id, name }),

	reorderSections: (spaceId: string, ids: string[]) =>
		invoke<void>("section_reorder", { spaceId, ids }),

	deleteSection: (id: string) => invoke<void>("section_delete", { id }),

	moveBotToSection: (botId: string, sectionId: string | null) =>
		invoke<void>("bot_move_to_section", { botId, sectionId }),

	moveBotToSpace: (botId: string, spaceId: string) =>
		invoke<void>("bot_move_to_space", { botId, spaceId }),

	bots: (spaceId?: string | null) =>
		invoke<Bot[]>("conversation_bots", { spaceId: spaceId ?? null }),

	createBot: (identity: BotIdentity, spaceId?: string | null) =>
		invoke<Bot>("conversation_create_bot", {
			identity,
			spaceId: spaceId ?? null,
		}),

	duplicateBot: (botId: string, spaceId?: string | null) =>
		invoke<Bot>("conversation_duplicate_bot", {
			botId,
			spaceId: spaceId ?? null,
		}),

	updateBot: (id: string, identity: BotIdentity) =>
		invoke<Bot>("conversation_update_bot", { id, identity }),

	deleteBot: (id: string) => invoke<void>("conversation_delete_bot", { id }),

	setBotAvatarImage: (id: string, bytes: Uint8Array) =>
		invoke<Bot>("conversation_set_bot_avatar_image", { id, bytes }),

	setBotMemory: (id: string, memory: string) =>
		invoke<Bot>("conversation_set_bot_memory", { id, memory }),

	botSkills: (botId: string) =>
		invoke<BotSkill[]>("conversation_bot_skills", { botId }),

	createBotSkill: (botId: string, draft: BotSkillDraft) =>
		invoke<BotSkill>("conversation_create_bot_skill", { botId, draft }),

	updateBotSkill: (botId: string, skillId: string, draft: BotSkillDraft) =>
		invoke<BotSkill>("conversation_update_bot_skill", {
			botId,
			skillId,
			draft,
		}),

	setBotSkillPreloaded: (
		botId: string,
		skillId: string,
		isPreloaded: boolean,
	) =>
		invoke<BotSkill>("conversation_set_bot_skill_preloaded", {
			botId,
			skillId,
			isPreloaded,
		}),

	deleteBotSkill: (botId: string, skillId: string) =>
		invoke<void>("conversation_delete_bot_skill", { botId, skillId }),

	botMcpServers: (botId: string) =>
		invoke<BotMcpServer[]>("conversation_bot_mcp_servers", { botId }),

	setBotMcpServer: (
		botId: string,
		name: string,
		config: Record<string, unknown>,
	) =>
		invoke<BotMcpServer>("conversation_set_bot_mcp_server", {
			botId,
			name,
			config,
		}),

	deleteBotMcpServer: (botId: string, name: string) =>
		invoke<void>("conversation_delete_bot_mcp_server", { botId, name }),

	botHistory: (botId: string) =>
		invoke<BotHistoryEntry[]>("conversation_bot_history", { botId }),

	botHistoryDiff: (botId: string, commitId: string) =>
		invoke<string>("conversation_bot_history_diff", { botId, commitId }),

	revertBot: (botId: string, commitId: string) =>
		invoke<BotHistoryEntry[]>("conversation_bot_revert", { botId, commitId }),

	userPluginSkills: () => invoke<BotSkill[]>("user_plugin_skills"),

	createUserPluginSkill: (draft: BotSkillDraft) =>
		invoke<BotSkill>("user_plugin_create_skill", { draft }),

	updateUserPluginSkill: (skillId: string, draft: BotSkillDraft) =>
		invoke<BotSkill>("user_plugin_update_skill", { skillId, draft }),

	setUserPluginSkillPreloaded: (skillId: string, isPreloaded: boolean) =>
		invoke<BotSkill>("user_plugin_set_skill_preloaded", {
			skillId,
			isPreloaded,
		}),

	deleteUserPluginSkill: (skillId: string) =>
		invoke<void>("user_plugin_delete_skill", { skillId }),

	userPluginHistory: () => invoke<BotHistoryEntry[]>("user_plugin_history"),

	userPluginHistoryDiff: (commitId: string) =>
		invoke<string>("user_plugin_history_diff", { commitId }),

	revertUserPlugin: (commitId: string) =>
		invoke<BotHistoryEntry[]>("user_plugin_revert", { commitId }),

	spacePluginSkills: (spaceId: string) =>
		invoke<BotSkill[]>("space_plugin_skills", { spaceId }),

	createSpacePluginSkill: (spaceId: string, draft: BotSkillDraft) =>
		invoke<BotSkill>("space_plugin_create_skill", { spaceId, draft }),

	updateSpacePluginSkill: (
		spaceId: string,
		skillId: string,
		draft: BotSkillDraft,
	) =>
		invoke<BotSkill>("space_plugin_update_skill", { spaceId, skillId, draft }),

	setSpacePluginSkillPreloaded: (
		spaceId: string,
		skillId: string,
		isPreloaded: boolean,
	) =>
		invoke<BotSkill>("space_plugin_set_skill_preloaded", {
			spaceId,
			skillId,
			isPreloaded,
		}),

	deleteSpacePluginSkill: (spaceId: string, skillId: string) =>
		invoke<void>("space_plugin_delete_skill", { spaceId, skillId }),

	spacePluginHistory: (spaceId: string) =>
		invoke<BotHistoryEntry[]>("space_plugin_history", { spaceId }),

	spacePluginHistoryDiff: (spaceId: string, commitId: string) =>
		invoke<string>("space_plugin_history_diff", { spaceId, commitId }),

	revertSpacePlugin: (spaceId: string, commitId: string) =>
		invoke<BotHistoryEntry[]>("space_plugin_revert", { spaceId, commitId }),

	recordBotCommands: (botId: string, commands: AgentCommand[]) =>
		invoke<void>("conversation_record_bot_commands", { botId, commands }),

	botCommands: (botId: string) =>
		invoke<AgentCommand[]>("conversation_bot_commands", { botId }),

	mainChat: (botId: string) =>
		invoke<Chat>("conversation_main_chat", { botId }),

	conversations: (spaceId: string) =>
		invoke<Conversation[]>("conversation_list", { spaceId }),

	createConversation: ({
		spaceId,
		sectionId,
		title,
		botIds,
	}: ConversationDraft) =>
		invoke<Conversation>("conversation_create", {
			spaceId,
			sectionId,
			title,
			botIds,
		}),

	updateConversation: (
		conversationId: string,
		{ title, instructions, sectionId }: ConversationEdit,
	) =>
		invoke<Conversation>("conversation_update", {
			conversationId,
			title,
			instructions,
			sectionId,
		}),

	deleteConversation: (conversationId: string) =>
		invoke<void>("conversation_delete", { conversationId }),

	openRuntimeSession: (
		conversationId: string,
		botId: string,
		startedAt: number,
		reason: string | null,
	) =>
		invoke<RuntimeSession>("conversation_open_runtime_session", {
			conversationId,
			botId,
			startedAt,
			reason,
		}),

	recordProviderSession: (
		conversationId: string,
		botId: string,
		runtimeSessionId: string,
		providerSessionId: string,
	) =>
		invoke<void>("conversation_record_provider_session", {
			conversationId,
			botId,
			runtimeSessionId,
			providerSessionId,
		}),

	boundedContext: (
		conversationId: string,
		botId: string,
		promptMessageId: string,
	) =>
		invoke<string>("conversation_bounded_context", {
			conversationId,
			botId,
			promptMessageId,
		}),

	captureCheckpoint: (
		conversationId: string,
		botId: string,
		runtimeSessionId: string | null,
		createdAt: number,
	) =>
		invoke<ContextCheckpoint | null>("conversation_capture_checkpoint", {
			conversationId,
			botId,
			runtimeSessionId,
			createdAt,
		}),

	messageReference: (conversationId: string, messageId: string) =>
		invoke<MessageReference | null>("conversation_message_reference", {
			conversationId,
			messageId,
		}),

	pinMessage: (
		conversationId: string,
		messageId: string,
		blockIndex: number,
		pinnedAt: number,
	) =>
		invoke<void>("conversation_pin_message", {
			conversationId,
			messageId,
			blockIndex,
			pinnedAt,
		}),

	unpinMessage: (
		conversationId: string,
		messageId: string,
		blockIndex: number,
	) =>
		invoke<void>("conversation_unpin_message", {
			conversationId,
			messageId,
			blockIndex,
		}),

	pinnedMessages: (conversationId: string) =>
		invoke<MessagePin[]>("conversation_pinned_messages", {
			conversationId,
		}),

	startTurn: (turn: NewTurn) =>
		invoke<number>("conversation_start_turn", { turn }),

	completeTurn: (id: string, completedAt: number) =>
		invoke<void>("conversation_complete_turn", { id, completedAt }),

	appendUserMessage: (message: NewUserMessage) =>
		invoke<number>("conversation_append_user_message", { message }),

	openAssistantMessage: (message: NewAssistantMessage) =>
		invoke<number>("conversation_open_assistant_message", { message }),

	appendText: (id: string, delta: string) =>
		invoke<void>("conversation_append_text", { id, delta }),

	finalizeMessage: (id: string, completion: TerminalCompletion) =>
		invoke<void>("conversation_finalize_message", { id, completion }),
}
