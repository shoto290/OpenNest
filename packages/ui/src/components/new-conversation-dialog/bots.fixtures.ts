import type { ConversationBot } from "@workspace/ui/components/conversation-bots"

const CONVERSATION_BOTS: ConversationBot[] = [
	{ id: "bot-atlas", name: "Atlas", animal: "owl", blot: "blue" },
	{ id: "bot-basile", name: "Basile", animal: "cat", blot: "purple" },
	{ id: "bot-clemence", name: "Clémence", animal: "rabbit", blot: "pink" },
	{ id: "bot-dorian", name: "Dorian", animal: "bear", blot: "orange" },
	{ id: "bot-elia", name: "Elia", animal: "mouse", blot: "green" },
	{ id: "bot-faust", name: "Faust", animal: "dog", blot: "cyan" },
]

const LONG_NAMED_BOTS: ConversationBot[] = [
	{
		id: "bot-release",
		name: "Release notes editor for the desktop build",
		animal: "koala",
		blot: "yellow",
	},
	{
		id: "bot-triage",
		name: "Incident triage and on-call handover companion",
		animal: "chick",
		blot: "red",
	},
]

export { CONVERSATION_BOTS, LONG_NAMED_BOTS }
