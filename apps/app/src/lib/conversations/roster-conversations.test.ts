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

describe("toRosterConversations", () => {
	it("draws a row carrying the title, the section and the participants in join order", () => {
		const rows = toRosterConversations([
			conversation({
				sectionId: "n-1",
				participants: [
					participant({ botId: "b-1", role: "lead", name: "Chef" }),
					participant({ botId: "b-2", name: "Sous-chef" }),
				],
			}),
		])

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
			},
		])
	})

	it("leaves out a participant that has left the room", () => {
		const rows = toRosterConversations([
			conversation({
				participants: [
					participant({ botId: "b-1" }),
					participant({ botId: "b-2", leftAt: 4 }),
				],
			}),
		])

		expect(rows[0].participants.map((held) => held.id)).toEqual(["b-1"])
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
