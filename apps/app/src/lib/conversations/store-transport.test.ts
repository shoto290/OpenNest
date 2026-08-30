import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
	BotSkillDraft,
	EnvScope,
	NewAssistantMessage,
	NewTurn,
	NewUserMessage,
	TranscriptStoreError,
} from "./store-contract"
import { conversationStore } from "./store-transport"
import {
	type TerminalCompletion,
	TRANSCRIPT_PAGE_SIZE,
	type TranscriptPage,
} from "./transcript-contract"
import {
	botIdentity,
	CONVERSATION,
	message,
	named,
} from "./transcript-fixtures"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

const PAGE: TranscriptPage = {
	conversationId: CONVERSATION,
	messages: [
		message({ id: "m-1", seq: 1 }),
		message({ id: "m-2", seq: 2 }),
		message({ id: "m-3", seq: 3 }),
	],
	hasMore: true,
}

const TURN: NewTurn = {
	id: "t-1",
	conversationId: CONVERSATION,
	startedAt: 1,
}

const USER_MESSAGE: NewUserMessage = {
	id: "m-1",
	conversationId: CONVERSATION,
	turnId: "t-1",
	authorBotId: null,
	repliedToMessageId: null,
	content: "hello",
	createdAt: 2,
}

const ASSISTANT_MESSAGE: NewAssistantMessage = {
	id: "m-2",
	conversationId: CONVERSATION,
	turnId: "t-1",
	authorBotId: "b-1",
	repliedToMessageId: "m-1",
	createdAt: 3,
}

type WriteCase = {
	member: string
	write: () => Promise<unknown>
	call: [command: string, args?: Record<string, unknown>]
}

const IDENTITY = botIdentity({ workingDir: "/work/opennest" })

const SKILL_DRAFT: BotSkillDraft = {
	name: "Baking",
	description: "How to bake.",
	body: "Bake at 220 degrees.",
	allowedTools: ["Read", "Write"],
	userInvocable: true,
	metadata: { author: "someone" },
}

const SERVER = { command: "atlas-mcp", args: ["--stdio"] }

const BOT_SCOPE: EnvScope = { kind: "bot", id: "b-1", spaceId: "s-1" }

const WRITES: WriteCase[] = [
	{
		member: "spaces",
		write: () => conversationStore.spaces(),
		call: ["space_list"],
	},
	{
		member: "createSpace",
		write: () => conversationStore.createSpace("Vocca"),
		call: ["space_create", { name: "Vocca" }],
	},
	{
		member: "updateSpace",
		write: () => conversationStore.updateSpace("s-1", "Work", "cyan"),
		call: ["space_update", { id: "s-1", name: "Work", colour: "cyan" }],
	},
	{
		member: "updateSpace",
		write: () => conversationStore.updateSpace("s-1", "Work"),
		call: ["space_update", { id: "s-1", name: "Work", colour: null }],
	},
	{
		member: "reorderSpaces",
		write: () => conversationStore.reorderSpaces(["s-2", "s-1"]),
		call: ["space_reorder", { ids: ["s-2", "s-1"] }],
	},
	{
		member: "deleteSpace",
		write: () => conversationStore.deleteSpace("s-1"),
		call: ["space_delete", { id: "s-1" }],
	},
	{
		member: "conversations",
		write: () => conversationStore.conversations("s-1"),
		call: ["conversation_list", { spaceId: "s-1" }],
	},
	{
		member: "createConversation",
		write: () =>
			conversationStore.createConversation({
				spaceId: "s-1",
				sectionId: "n-1",
				title: "Launch",
				botIds: ["b-1", "b-2"],
			}),
		call: [
			"conversation_create",
			{
				spaceId: "s-1",
				sectionId: "n-1",
				title: "Launch",
				botIds: ["b-1", "b-2"],
			},
		],
	},
	{
		member: "updateConversation",
		write: () =>
			conversationStore.updateConversation("c-1", {
				title: "Launch",
				instructions: "Stay short.",
				sectionId: null,
			}),
		call: [
			"conversation_update",
			{
				conversationId: "c-1",
				title: "Launch",
				instructions: "Stay short.",
				sectionId: null,
			},
		],
	},
	{
		member: "deleteConversation",
		write: () => conversationStore.deleteConversation("c-1"),
		call: ["conversation_delete", { conversationId: "c-1" }],
	},
	{
		member: "addConversationParticipant",
		write: () => conversationStore.addConversationParticipant("c-1", "b-1"),
		call: [
			"conversation_add_participant",
			{ conversationId: "c-1", botId: "b-1" },
		],
	},
	{
		member: "removeConversationParticipant",
		write: () => conversationStore.removeConversationParticipant("c-1", "b-1"),
		call: [
			"conversation_remove_participant",
			{ conversationId: "c-1", botId: "b-1" },
		],
	},
	{
		member: "setConversationLead",
		write: () => conversationStore.setConversationLead("c-1", "b-1"),
		call: ["conversation_set_lead", { conversationId: "c-1", botId: "b-1" }],
	},
	{
		member: "sections",
		write: () => conversationStore.sections("s-1"),
		call: ["section_list", { spaceId: "s-1" }],
	},
	{
		member: "createSection",
		write: () => conversationStore.createSection("s-1", "Writers"),
		call: ["section_create", { spaceId: "s-1", name: "Writers" }],
	},
	{
		member: "renameSection",
		write: () => conversationStore.renameSection("n-1", "Readers"),
		call: ["section_rename", { id: "n-1", name: "Readers" }],
	},
	{
		member: "pinRoster",
		write: () =>
			conversationStore.pinRoster("s-1", [{ id: "n-2", sectionId: null }]),
		call: [
			"roster_pin",
			{ spaceId: "s-1", pins: [{ id: "n-2", sectionId: null }] },
		],
	},
	{
		member: "deleteSection",
		write: () => conversationStore.deleteSection("n-1"),
		call: ["section_delete", { id: "n-1" }],
	},
	{
		member: "moveBotToSection",
		write: () => conversationStore.moveBotToSection("b-1", "n-1"),
		call: ["bot_move_to_section", { botId: "b-1", sectionId: "n-1" }],
	},
	{
		member: "moveBotToSection out of every section",
		write: () => conversationStore.moveBotToSection("b-1", null),
		call: ["bot_move_to_section", { botId: "b-1", sectionId: null }],
	},
	{
		member: "moveBotToSpace",
		write: () => conversationStore.moveBotToSpace("b-1", "s-2"),
		call: ["bot_move_to_space", { botId: "b-1", spaceId: "s-2" }],
	},
	{
		member: "bots",
		write: () => conversationStore.bots("s-1"),
		call: ["conversation_bots", { spaceId: "s-1" }],
	},
	{
		member: "createBot",
		write: () => conversationStore.createBot(IDENTITY, "s-1"),
		call: ["conversation_create_bot", { identity: IDENTITY, spaceId: "s-1" }],
	},
	{
		member: "duplicateBot",
		write: () => conversationStore.duplicateBot("b-1"),
		call: ["conversation_duplicate_bot", { botId: "b-1", spaceId: null }],
	},
	{
		member: "updateBot",
		write: () => conversationStore.updateBot("b-1", IDENTITY),
		call: ["conversation_update_bot", { id: "b-1", identity: IDENTITY }],
	},
	{
		member: "deleteBot",
		write: () => conversationStore.deleteBot("b-1"),
		call: ["conversation_delete_bot", { id: "b-1" }],
	},
	{
		member: "botSkills",
		write: () => conversationStore.botSkills("b-1"),
		call: ["conversation_bot_skills", { botId: "b-1" }],
	},
	{
		member: "createBotSkill",
		write: () => conversationStore.createBotSkill("b-1", SKILL_DRAFT),
		call: [
			"conversation_create_bot_skill",
			{ botId: "b-1", draft: SKILL_DRAFT },
		],
	},
	{
		member: "updateBotSkill",
		write: () => conversationStore.updateBotSkill("b-1", "baking", SKILL_DRAFT),
		call: [
			"conversation_update_bot_skill",
			{ botId: "b-1", skillId: "baking", draft: SKILL_DRAFT },
		],
	},
	{
		member: "setBotSkillPreloaded",
		write: () => conversationStore.setBotSkillPreloaded("b-1", "baking", true),
		call: [
			"conversation_set_bot_skill_preloaded",
			{ botId: "b-1", skillId: "baking", isPreloaded: true },
		],
	},
	{
		member: "deleteBotSkill",
		write: () => conversationStore.deleteBotSkill("b-1", "baking"),
		call: [
			"conversation_delete_bot_skill",
			{ botId: "b-1", skillId: "baking" },
		],
	},
	{
		member: "botMcpServers",
		write: () => conversationStore.botMcpServers("b-1"),
		call: ["conversation_bot_mcp_servers", { botId: "b-1" }],
	},
	{
		member: "setBotMcpServer",
		write: () => conversationStore.setBotMcpServer("b-1", "atlas", SERVER),
		call: [
			"conversation_set_bot_mcp_server",
			{ botId: "b-1", name: "atlas", config: SERVER },
		],
	},
	{
		member: "deleteBotMcpServer",
		write: () => conversationStore.deleteBotMcpServer("b-1", "atlas"),
		call: [
			"conversation_delete_bot_mcp_server",
			{ botId: "b-1", name: "atlas" },
		],
	},
	{
		member: "environmentVariables",
		write: () => conversationStore.environmentVariables(BOT_SCOPE),
		call: ["env_list", { scope: BOT_SCOPE }],
	},
	{
		member: "setEnvironmentVariable",
		write: () =>
			conversationStore.setEnvironmentVariable(
				BOT_SCOPE,
				"ATLAS_TOKEN",
				"sk-1",
			),
		call: ["env_set", { scope: BOT_SCOPE, name: "ATLAS_TOKEN", value: "sk-1" }],
	},
	{
		member: "deleteEnvironmentVariable",
		write: () =>
			conversationStore.deleteEnvironmentVariable(BOT_SCOPE, "ATLAS_TOKEN"),
		call: ["env_delete", { scope: BOT_SCOPE, name: "ATLAS_TOKEN" }],
	},
	{
		member: "recordBotCommands",
		write: () => conversationStore.recordBotCommands("b-1", named("review")),
		call: [
			"conversation_record_bot_commands",
			{ botId: "b-1", commands: named("review") },
		],
	},
	{
		member: "botCommands",
		write: () => conversationStore.botCommands("b-1"),
		call: ["conversation_bot_commands", { botId: "b-1" }],
	},
	{
		member: "mainChat",
		write: () => conversationStore.mainChat("b-1"),
		call: ["conversation_main_chat", { botId: "b-1" }],
	},
	{
		member: "recordProviderSession",
		write: () =>
			conversationStore.recordProviderSession(
				CONVERSATION,
				"b-1",
				"run-1",
				"claude-9f3c",
			),
		call: [
			"conversation_record_provider_session",
			{
				conversationId: CONVERSATION,
				botId: "b-1",
				runtimeSessionId: "run-1",
				providerSessionId: "claude-9f3c",
			},
		],
	},
	{
		member: "startTurn",
		write: () => conversationStore.startTurn(TURN),
		call: ["conversation_start_turn", { turn: TURN }],
	},
	{
		member: "completeTurn",
		write: () => conversationStore.completeTurn("t-1", 9),
		call: ["conversation_complete_turn", { id: "t-1", completedAt: 9 }],
	},
	{
		member: "appendUserMessage",
		write: () => conversationStore.appendUserMessage(USER_MESSAGE),
		call: ["conversation_append_user_message", { message: USER_MESSAGE }],
	},
	{
		member: "openAssistantMessage",
		write: () => conversationStore.openAssistantMessage(ASSISTANT_MESSAGE),
		call: [
			"conversation_open_assistant_message",
			{ message: ASSISTANT_MESSAGE },
		],
	},
	{
		member: "appendText",
		write: () => conversationStore.appendText("m-2", "Hello"),
		call: ["conversation_append_text", { id: "m-2", delta: "Hello" }],
	},
	{
		member: "finalizeMessage",
		write: () => conversationStore.finalizeMessage("m-2", "complete"),
		call: [
			"conversation_finalize_message",
			{ id: "m-2", completion: "complete" },
		],
	},
]

const ENDINGS: TerminalCompletion[] = [
	"complete",
	"cancelled",
	"failed",
	"interrupted",
]

const FAILURES: TranscriptStoreError[] = [
	{ kind: "conflict", id: "m1", field: "content" },
	{ kind: "unavailable", failure: { kind: "appDataDir" } },
	{ kind: "unknownBot", id: "b-1" },
]

beforeEach(() => {
	hostInvoke.mockReset()
	hostInvoke.mockResolvedValue(undefined)
})

describe("conversationStore reads", () => {
	it("asks for the tail with a null cursor and the default page size", async () => {
		hostInvoke.mockResolvedValue(PAGE)

		const loaded = await conversationStore.loadPage(CONVERSATION, null)

		expect(hostInvoke).toHaveBeenCalledWith("conversation_message_page", {
			conversationId: CONVERSATION,
			beforeSeq: null,
			limit: TRANSCRIPT_PAGE_SIZE,
		})
		expect(loaded).toEqual(PAGE)
		expect(loaded.messages.map((entry) => entry.id)).toEqual([
			"m-1",
			"m-2",
			"m-3",
		])
	})

	it("asks for what precedes the cursor, never the cursor itself", async () => {
		hostInvoke.mockResolvedValue(PAGE)

		await conversationStore.loadPage(CONVERSATION, { beforeSeq: 7 })

		expect(hostInvoke).toHaveBeenCalledWith("conversation_message_page", {
			conversationId: CONVERSATION,
			beforeSeq: 7,
			limit: TRANSCRIPT_PAGE_SIZE,
		})
	})
})

describe("conversationStore writes", () => {
	it.each(WRITES)(
		"sends $member to its command with its argument keys",
		async ({ write, call }) => {
			await write()

			expect(hostInvoke).toHaveBeenCalledWith(...call)
		},
	)

	it.each(ENDINGS)("finalizes a message as %s verbatim", async (completion) => {
		await conversationStore.finalizeMessage("m-2", completion)

		expect(hostInvoke).toHaveBeenCalledWith("conversation_finalize_message", {
			id: "m-2",
			completion,
		})
	})
})

describe("conversationStore failures", () => {
	it.each(FAILURES)("rejects a $kind failure unchanged", async (failure) => {
		hostInvoke.mockRejectedValue(failure)

		await expect(conversationStore.loadPage(CONVERSATION, null)).rejects.toBe(
			failure,
		)
		await expect(conversationStore.appendText("m1", "Hello")).rejects.toBe(
			failure,
		)
	})
})
