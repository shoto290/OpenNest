import type {
	ChatMessage,
	MessageCompletion,
	TurnOutcome,
} from "../agent/contract"
import type { TerminalCompletion } from "../conversations/transcript-contract"

export const ENDING_FOR: Record<MessageCompletion, TerminalCompletion | null> =
	{
		streaming: null,
		complete: "complete",
		cancelled: "cancelled",
		failed: "failed",
	}

export const ENDING_FOR_OUTCOME: Record<TurnOutcome, TerminalCompletion> = {
	completed: "complete",
	cancelled: "cancelled",
	failed: "failed",
}

export const isWorthKeeping = (
	message: ChatMessage,
	completion: TerminalCompletion,
): boolean => message.text.length > 0 || completion !== "complete"
