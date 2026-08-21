import { invoke } from "@tauri-apps/api/core"

import type {
	Bot,
	BotIdentity,
	Chat,
	ContextCheckpoint,
	NewAssistantMessage,
	NewTurn,
	NewUserMessage,
	RuntimeSession,
} from "./store-contract"
import type { TranscriptStore } from "./store-port"
import {
	type TerminalCompletion,
	TRANSCRIPT_PAGE_SIZE,
	type TranscriptCursor,
	type TranscriptPage,
} from "./transcript-contract"

import type { AgentCommand } from "@/lib/agent/contract"

/** The host owns the page and the failure: nothing here reshapes what came back
 * and nothing catches, so a `TranscriptStoreError` reaches the caller as sent. */
export const conversationStore: TranscriptStore = {
	loadPage: (conversationId: string, cursor: TranscriptCursor | null) =>
		invoke<TranscriptPage>("conversation_message_page", {
			conversationId,
			beforeSeq: cursor?.beforeSeq ?? null,
			limit: TRANSCRIPT_PAGE_SIZE,
		}),

	bots: () => invoke<Bot[]>("conversation_bots"),

	createBot: (identity: BotIdentity) =>
		invoke<Bot>("conversation_create_bot", { identity }),

	updateBot: (id: string, identity: BotIdentity) =>
		invoke<Bot>("conversation_update_bot", { id, identity }),

	deleteBot: (id: string) => invoke<void>("conversation_delete_bot", { id }),

	setBotAvatarImage: (id: string, bytes: Uint8Array) =>
		invoke<Bot>("conversation_set_bot_avatar_image", { id, bytes }),

	recordBotCommands: (botId: string, commands: AgentCommand[]) =>
		invoke<void>("conversation_record_bot_commands", { botId, commands }),

	botCommands: (botId: string) =>
		invoke<AgentCommand[]>("conversation_bot_commands", { botId }),

	mainChat: (botId: string) =>
		invoke<Chat>("conversation_main_chat", { botId }),

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
