import { invoke } from "@tauri-apps/api/core"

import type {
	Bot,
	Chat,
	NewAssistantMessage,
	NewTurn,
	NewUserMessage,
} from "./store-contract"
import type { TranscriptStore } from "./store-port"
import type {
	TerminalCompletion,
	TranscriptCursor,
	TranscriptPage,
} from "./transcript-contract"

export const TRANSCRIPT_PAGE_SIZE = 20

/** The host owns the page and the failure: nothing here reshapes what came back
 * and nothing catches, so a `TranscriptStoreError` reaches the caller as sent. */
export const conversationStore: TranscriptStore = {
	loadPage: (conversationId: string, cursor: TranscriptCursor | null) =>
		invoke<TranscriptPage>("conversation_message_page", {
			conversationId,
			beforeSeq: cursor?.beforeSeq ?? null,
			limit: TRANSCRIPT_PAGE_SIZE,
		}),

	defaultBot: () => invoke<Bot>("conversation_default_bot"),

	mainChat: (botId: string) =>
		invoke<Chat>("conversation_main_chat", { botId }),

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
