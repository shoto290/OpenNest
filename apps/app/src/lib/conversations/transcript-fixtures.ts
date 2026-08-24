import { DEFAULT_BOT_OUTPUT_STYLE } from "@workspace/ui/components/bot-settings"

import type { BotIdentity } from "./store-contract"
import type { TranscriptMessage } from "./transcript-contract"

import type { AgentCommand } from "@/lib/agent/contract"

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
	avatarBlot: "green",
	avatarImagePath: null,
	workingDir: null,
	instructions: "Answer with the file you would touch.",
	deniedTools: [],
	outputStyle: DEFAULT_BOT_OUTPUT_STYLE,
	...overrides,
})

export const named = (...names: string[]): AgentCommand[] =>
	names.map((name) => ({ name }))
