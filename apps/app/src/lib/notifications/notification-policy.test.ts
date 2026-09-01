import { describe, expect, it } from "vitest"

import {
	type ConversationPolicyInput,
	type ConversationRound,
	type NotificationPolicyInput,
	type NotificationSwitches,
	notificationsFor,
	notifiesFinishedRound,
} from "./notification-policy"

import type { PermissionRequest, QuestionRequest } from "../agent/contract"
import { type ChatState, initialChatState } from "../chat/chat-state"
import { speakingBot } from "../conversations/transcript-fixtures"

const ALL_ON: NotificationSwitches = {
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
}

const state = (overrides: Partial<ChatState> = {}): ChatState => ({
	...initialChatState,
	...overrides,
})

const permission = (id: string): PermissionRequest => ({
	id,
	toolName: "Bash",
	title: "Run npm test",
	detail: null,
})

const question = (id: string): QuestionRequest => ({
	id,
	questions: [
		{
			header: "Pick one",
			question: "Which branch?",
			options: [],
			multiSelect: false,
		},
	],
})

const decide = (input: Partial<NotificationPolicyInput>) =>
	notificationsFor({
		botId: "bot-1",
		before: state(),
		after: state(),
		switches: ALL_ON,
		hasFocus: false,
		...input,
	})

describe("notificationsFor", () => {
	it("reports a question the state before did not hold", () => {
		expect(decide({ after: state({ question: question("q-1") }) })).toEqual([
			{ botId: "bot-1", event: "question" },
		])
	})

	it("reports a permission the state before did not hold", () => {
		expect(decide({ after: state({ permission: permission("p-1") }) })).toEqual(
			[{ botId: "bot-1", event: "permission" }],
		)
	})

	it("reports a turn that answered on its own", () => {
		expect(
			decide({ before: state({ turn: "running" }), after: state() }),
		).toEqual([{ botId: "bot-1", event: "finishedTurn" }])
	})

	it("reports nothing for a question still held across a change", () => {
		expect(
			decide({
				before: state({ question: question("q-1") }),
				after: state({ question: question("q-1"), errorCount: 1 }),
			}),
		).toEqual([])
	})

	it("reports nothing for a permission still held across a change", () => {
		expect(
			decide({
				before: state({ permission: permission("p-1") }),
				after: state({ permission: permission("p-1"), errorCount: 1 }),
			}),
		).toEqual([])
	})

	it("reports the next question once the one before it was answered", () => {
		expect(
			decide({
				before: state({ question: question("q-1") }),
				after: state({ question: question("q-2") }),
			}),
		).toEqual([{ botId: "bot-1", event: "question" }])
	})

	it("reports nothing for a turn that failed", () => {
		expect(
			decide({
				before: state({ turn: "running" }),
				after: state({ turn: "failed" }),
			}),
		).toEqual([])
	})

	it("reports nothing for a turn the reader stopped", () => {
		expect(
			decide({ before: state({ turn: "stopping" }), after: state() }),
		).toEqual([])
	})

	it("reports nothing for a turn that starts", () => {
		expect(
			decide({ before: state(), after: state({ turn: "running" }) }),
		).toEqual([])
	})

	it("reports nothing for a stop the turn has not left yet", () => {
		expect(
			decide({
				before: state({ turn: "running" }),
				after: state({ turn: "stopping" }),
			}),
		).toEqual([])
	})

	it("sends nothing while the window holds the focus", () => {
		expect(
			decide({
				after: state({ question: question("q-1") }),
				hasFocus: true,
			}),
		).toEqual([])
	})

	it("sends nothing for an event whose switch is off", () => {
		expect(
			decide({
				after: state({ question: question("q-1") }),
				switches: { ...ALL_ON, notifyOnQuestion: false },
			}),
		).toEqual([])
	})

	it("keeps the events whose switches are on", () => {
		expect(
			decide({
				before: state({ turn: "running" }),
				after: state({ question: question("q-1") }),
				switches: { ...ALL_ON, notifyOnFinishedTurn: false },
			}),
		).toEqual([{ botId: "bot-1", event: "question" }])
	})

	it("names the bot the change is about", () => {
		expect(
			decide({
				botId: "bot-7",
				after: state({ permission: permission("p-1") }),
			}),
		).toEqual([{ botId: "bot-7", event: "permission" }])
	})

	it("reports nothing when nothing moved", () => {
		expect(decide({})).toEqual([])
	})
})

const round = (
	overrides: Partial<ConversationRound> = {},
): ConversationRound => ({
	speakers: [],
	waitingBotIds: [],
	...overrides,
})

const decideRound = (input: Partial<ConversationPolicyInput>) =>
	notifiesFinishedRound({
		before: round(),
		after: round(),
		switches: ALL_ON,
		hasFocus: false,
		...input,
	})

describe("notifiesFinishedRound", () => {
	it("reports the last bot of the room falling silent", () => {
		expect(
			decideRound({ before: round({ speakers: [speakingBot("bot-1")] }) }),
		).toBe(true)
	})

	it("reports nothing while a bot is still speaking", () => {
		expect(
			decideRound({
				before: round({ speakers: [speakingBot("bot-1")] }),
				after: round({ speakers: [speakingBot("bot-2")] }),
			}),
		).toBe(false)
	})

	it("reports nothing while a bot is still waiting its turn", () => {
		expect(
			decideRound({
				before: round({
					speakers: [speakingBot("bot-1")],
					waitingBotIds: ["bot-2"],
				}),
				after: round({ waitingBotIds: ["bot-2"] }),
			}),
		).toBe(false)
	})

	it("reports the room falling silent once the last waiting bot has spoken", () => {
		expect(
			decideRound({
				before: round({ speakers: [speakingBot("bot-2")] }),
				after: round(),
			}),
		).toBe(true)
	})

	it("reports nothing for a room that was silent already", () => {
		expect(decideRound({})).toBe(false)
	})

	it("reports nothing for a round that starts", () => {
		expect(
			decideRound({ after: round({ speakers: [speakingBot("bot-1")] }) }),
		).toBe(false)
	})

	it("reports nothing while the window holds the focus", () => {
		expect(
			decideRound({
				before: round({ speakers: [speakingBot("bot-1")] }),
				hasFocus: true,
			}),
		).toBe(false)
	})

	it("reports nothing while the finished turn switch is off", () => {
		expect(
			decideRound({
				before: round({ speakers: [speakingBot("bot-1")] }),
				switches: { ...ALL_ON, notifyOnFinishedTurn: false },
			}),
		).toBe(false)
	})
})
