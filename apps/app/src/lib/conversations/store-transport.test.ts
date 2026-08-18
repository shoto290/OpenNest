import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
	BotIdentity,
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
import { CONVERSATION, message } from "./transcript-fixtures"

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

const IDENTITY: BotIdentity = {
	name: "Nyx",
	title: "Reviewer",
	description: "Reads a diff and says what it would change.",
	model: "opus",
	avatarAnimal: "owl",
	avatarPose: "curious",
	avatarImagePath: null,
	workingDir: "/work/opennest",
}

const WRITES: WriteCase[] = [
	{
		member: "defaultBot",
		write: () => conversationStore.defaultBot(),
		call: ["conversation_default_bot"],
	},
	{
		member: "bots",
		write: () => conversationStore.bots(),
		call: ["conversation_bots"],
	},
	{
		member: "createBot",
		write: () => conversationStore.createBot(IDENTITY),
		call: ["conversation_create_bot", { identity: IDENTITY }],
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
