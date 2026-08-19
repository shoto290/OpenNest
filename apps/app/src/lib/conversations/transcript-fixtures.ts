import type { BotIdentity } from "./store-contract"
import type { TranscriptMessage } from "./transcript-contract"

export const CONVERSATION = "c-1"

export const OTHER_CONVERSATION = "c-2"

export const message = (
	overrides: Partial<TranscriptMessage> = {},
): TranscriptMessage => ({
	id: "m-1",
	conversationId: CONVERSATION,
	turnId: "t-1",
	seq: 1,
	role: "assistant",
	content: "",
	completion: "complete",
	createdAt: 0,
	...overrides,
})

export const botIdentity = (
	overrides: Partial<BotIdentity> = {},
): BotIdentity => ({
	name: "Nyx",
	title: "Reviewer",
	model: "opus",
	avatarAnimal: "owl",
	avatarBlot: "moss",
	avatarImagePath: null,
	workingDir: null,
	instructions: "Answer with the file you would touch.",
	...overrides,
})
