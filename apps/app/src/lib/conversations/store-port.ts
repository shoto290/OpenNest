import type {
	Bot,
	Chat,
	ContextCheckpoint,
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
	 * of them or with none. `reason` is why that replaced run was left behind, and
	 * `null` only for the first run of a lineage, which replaces nothing. */
	openRuntimeSession: (
		conversationId: string,
		botId: string,
		startedAt: number,
		reason: string | null,
	) => Promise<RuntimeSession>
	/** The id the provider gave the process answering in a run, kept beside that run
	 * and never in place of it: `runtimeSessionId` is this side's name for the run,
	 * `providerSessionId` is Claude's for the process. Written once and only while
	 * the run is live — the same id again is the callback arriving twice, anything
	 * else is refused. */
	recordProviderSession: (
		conversationId: string,
		botId: string,
		runtimeSessionId: string,
		providerSessionId: string,
	) => Promise<void>
	/** Everything a run has to be told to carry on a conversation it never saw,
	 * bounded and composed by the host. The prompt is named rather than sent: it is
	 * already on the record, and reading it from there is what keeps it out of its
	 * own context and at the end of it exactly once. */
	boundedContext: (
		conversationId: string,
		botId: string,
		promptMessageId: string,
	) => Promise<string>
	/** Folds what a context can no longer afford to carry word for word into the
	 * recovery point the next one resumes from. `null` says there was nothing new to
	 * fold, which leaves the previous checkpoint answering for the conversation. */
	captureCheckpoint: (
		conversationId: string,
		botId: string,
		runtimeSessionId: string | null,
		createdAt: number,
	) => Promise<ContextCheckpoint | null>
	startTurn: (turn: NewTurn) => Promise<number>
	completeTurn: (id: string, completedAt: number) => Promise<void>
	appendUserMessage: (message: NewUserMessage) => Promise<number>
	openAssistantMessage: (message: NewAssistantMessage) => Promise<number>
	appendText: (id: string, delta: string) => Promise<void>
	finalizeMessage: (id: string, completion: TerminalCompletion) => Promise<void>
}
