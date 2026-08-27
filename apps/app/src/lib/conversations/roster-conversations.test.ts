import { describe, expect, it } from "vitest"

import {
	toConversationSettingsValue,
	toRosterConversations,
	unseatedBots,
} from "./roster-conversations"
import type { Bot, Conversation, Participant } from "./store-contract"

const participant = (fields: Partial<Participant> = {}): Participant => ({
	botId: "b-1",
	role: "assistant",
	joinedAt: 1,
	leftAt: null,
	name: "Chef",
	avatarAnimal: "cat",
	avatarBlot: "cyan",
	avatarImagePath: null,
	isDeleted: false,
	...fields,
})

const conversation = (fields: Partial<Conversation> = {}): Conversation => ({
	id: "c-1",
	spaceId: "personal",
	sectionId: null,
	title: "Launch",
	instructions: "",
	createdAt: 1,
	updatedAt: 1,
	participants: [participant()],
	...fields,
})

const NOW = Date.UTC(2025, 0, 2, 12, 0, 0)

const A_MINUTE_AGO = NOW - 60 * 1000

describe("toRosterConversations", () => {
	it("draws a row carrying the title, the section and the participants in join order", () => {
		const rows = toRosterConversations(
			[
				conversation({
					sectionId: "n-1",
					participants: [
						participant({ botId: "b-1", role: "lead", name: "Chef" }),
						participant({ botId: "b-2", name: "Sous-chef" }),
					],
				}),
			],
			{},
			NOW,
		)

		expect(rows).toEqual([
			{
				id: "c-1",
				name: "Launch",
				sectionId: "n-1",
				participants: [
					{
						id: "b-1",
						name: "Chef",
						animal: "cat",
						blot: "cyan",
						image: undefined,
					},
					{
						id: "b-2",
						name: "Sous-chef",
						animal: "cat",
						blot: "cyan",
						image: undefined,
					},
				],
				lastMessage: undefined,
				lastSpeaker: undefined,
				timestamp: undefined,
			},
		])
	})

	it("leaves out a participant that has left the room", () => {
		const rows = toRosterConversations(
			[
				conversation({
					participants: [
						participant({ botId: "b-1" }),
						participant({ botId: "b-2", leftAt: 4 }),
					],
				}),
			],
			{},
			NOW,
		)

		expect(rows[0].participants.map((held) => held.id)).toEqual(["b-1"])
	})

	it("previews the last word of the room and how long ago it was said", () => {
		const [row] = toRosterConversations(
			[conversation()],
			{ "c-1": { text: "Menu is set.", at: A_MINUTE_AGO } },
			NOW,
		)

		expect(row.lastMessage).toBe("Menu is set.")
		expect(row.timestamp).toBe("1m")
	})

	const speakerAfter = (
		participants: Participant[],
		authorBotId?: string,
	): string | undefined =>
		toRosterConversations(
			[conversation({ participants })],
			{ "c-1": { text: "Menu is set.", at: A_MINUTE_AGO, authorBotId } },
			NOW,
		)[0].lastSpeaker

	it("names the bot still seated that said the last word", () => {
		expect(speakerAfter([participant({ botId: "b-1" })], "b-1")).toBe("Chef")
	})

	it("names nobody when the reader said the last word", () => {
		expect(speakerAfter([participant()])).toBeUndefined()
	})

	it("names nobody when the bot that spoke has left the room", () => {
		expect(speakerAfter([participant({ leftAt: 4 })], "b-1")).toBeUndefined()
	})

	it("names nobody when the bot that spoke no longer exists", () => {
		expect(
			speakerAfter([participant({ isDeleted: true })], "b-1"),
		).toBeUndefined()
	})

	it("leaves the preview and the time of a room nothing was said in blank", () => {
		const [row] = toRosterConversations([conversation()], {}, NOW)

		expect(row.lastMessage).toBeUndefined()
		expect(row.timestamp).toBeUndefined()
	})

	it("draws the room of the most recent word first", () => {
		const rows = toRosterConversations(
			[
				conversation({ id: "c-1" }),
				conversation({ id: "c-2" }),
				conversation({ id: "c-3" }),
			],
			{
				"c-1": { text: "Older.", at: A_MINUTE_AGO - 1000 },
				"c-3": { text: "Newer.", at: A_MINUTE_AGO },
			},
			NOW,
		)

		expect(rows.map((row) => row.id)).toEqual(["c-3", "c-1", "c-2"])
	})

	it("dates a room nothing was said in by the day it was opened", () => {
		const rows = toRosterConversations(
			[
				conversation({ id: "c-1", createdAt: A_MINUTE_AGO }),
				conversation({ id: "c-2", createdAt: NOW }),
			],
			{},
			NOW,
		)

		expect(rows.map((row) => row.id)).toEqual(["c-2", "c-1"])
	})
})

const bot = (fields: Partial<Bot> = {}): Bot => ({
	id: "b-1",
	name: "Chef",
	title: "",
	model: "sonnet",
	avatarAnimal: "cat",
	avatarBlot: "cyan",
	avatarImagePath: null,
	workingDir: null,
	instructions: "",
	deniedTools: [],
	outputStyle: "",
	createdAt: 1,
	changesNothing: false,
	memory: "",
	sectionId: null,
	...fields,
})

describe("unseatedBots", () => {
	it("offers only the bots of the space that hold no seat", () => {
		const offered = unseatedBots(
			[bot({ id: "b-1" }), bot({ id: "b-2", name: "Sous-chef" })],
			conversation({ participants: [participant({ botId: "b-1" })] }),
		)

		expect(offered).toEqual([
			{
				id: "b-2",
				name: "Sous-chef",
				animal: "cat",
				blot: "cyan",
				image: undefined,
			},
		])
	})

	it("offers a dismissed bot again", () => {
		const offered = unseatedBots(
			[bot({ id: "b-1" })],
			conversation({
				participants: [participant({ botId: "b-1", leftAt: 4 })],
			}),
		)

		expect(offered.map((held) => held.id)).toEqual(["b-1"])
	})
})

describe("toConversationSettingsValue", () => {
	it("reads the name and the instructions the conversation carries", () => {
		expect(
			toConversationSettingsValue(
				conversation({ title: "Launch", instructions: "Stay short." }),
			),
		).toEqual({ name: "Launch", instructions: "Stay short." })
	})
})
