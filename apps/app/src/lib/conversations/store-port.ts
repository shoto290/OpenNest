import type {
	Bot,
	Chat,
	NewAssistantMessage,
	NewTurn,
	NewUserMessage,
	RuntimeSession,
} from "./store-contract"
import type { TerminalCompletion } from "./transcript-contract"
import type { TranscriptPort } from "./transcript-port"

/** The write half of a conversation, on top of the reads so a fake and the real
 * store stay interchangeable. An append answers with the `seq` the store gave the
 * row: the caller never picks its own place in the transcript. */
export type TranscriptStore = TranscriptPort & {
	defaultBot: () => Promise<Bot>
	mainChat: (botId: string) => Promise<Chat>
	/** Opens the run a Claude process is about to be started for. The live run it
	 * replaces is rotated by the same call, so a participant is never left with two
	 * of them or with none. */
	openRuntimeSession: (
		conversationId: string,
		botId: string,
		startedAt: number,
	) => Promise<RuntimeSession>
	startTurn: (turn: NewTurn) => Promise<number>
	completeTurn: (id: string, completedAt: number) => Promise<void>
	appendUserMessage: (message: NewUserMessage) => Promise<number>
	openAssistantMessage: (message: NewAssistantMessage) => Promise<number>
	appendText: (id: string, delta: string) => Promise<void>
	finalizeMessage: (id: string, completion: TerminalCompletion) => Promise<void>
}
