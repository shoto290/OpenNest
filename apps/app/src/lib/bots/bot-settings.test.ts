import { describe, expect, it } from "vitest"

import {
	avatarSrc,
	MODEL_OPTIONS,
	newBotIdentity,
	toIdentity,
	toRosterBots,
	toSettingsValue,
} from "./bot-settings"

import type { Bot } from "../conversations/store-contract"
import { botIdentity } from "../conversations/transcript-fixtures"

const bot = (overrides: Partial<Bot> = {}): Bot => ({
	...botIdentity(),
	id: "b-1",
	createdAt: 1,
	...overrides,
})

describe("toSettingsValue", () => {
	it("hands the panel every field a bot was described with", () => {
		expect(
			toSettingsValue(
				bot({
					name: "Nyx",
					title: "Reviewer",
					description: "Reads a diff.",
					instructions: "Answer briefly.",
					model: "haiku",
					avatarAnimal: "owl",
					avatarPose: "curious",
					workingDir: "/work/opennest",
				}),
			),
		).toEqual({
			identity: { animal: "owl", pose: "curious", image: undefined },
			name: "Nyx",
			title: "Reviewer",
			description: "Reads a diff.",
			instructions: "Answer briefly.",
			model: "haiku",
			workingDirectory: "/work/opennest",
		})
	})

	// The two the store keeps as absences: a bot with nowhere to work is not a bot
	// working at the empty path, and the field shows its own placeholder instead.
	it("reads a directory the bot does not have as no text at all", () => {
		expect(toSettingsValue(bot({ workingDir: null })).workingDirectory).toBe("")
	})
})

describe("toIdentity", () => {
	const stored = bot({ avatarImagePath: "/pictures/owl.png" })

	it("keeps the stored path while the value still carries a picture", () => {
		const value = toSettingsValue(stored)

		expect(toIdentity(value, stored).avatarImagePath).toBe("/pictures/owl.png")
	})

	it("takes the picture off when the value carries none", () => {
		const value = toSettingsValue(stored)

		expect(
			toIdentity(
				{ ...value, identity: { animal: "bear", pose: "happy" } },
				stored,
			),
		).toMatchObject({
			avatarAnimal: "bear",
			avatarPose: "happy",
			avatarImagePath: null,
		})
	})

	it("writes a directory nobody typed as an absence rather than as empty text", () => {
		const value = toSettingsValue(stored)

		expect(
			toIdentity({ ...value, workingDirectory: "   " }, stored).workingDir,
		).toBeNull()
	})

	// The select is built from `MODEL_OPTIONS`, so it can only emit a word the store
	// accepts. Anything else is a caller that did not go through the panel at all.
	it("keeps a bot on a model the store knows", () => {
		const value = toSettingsValue(stored)

		for (const option of MODEL_OPTIONS) {
			expect(toIdentity({ ...value, model: option.value }, stored).model).toBe(
				option.value,
			)
		}
		expect(toIdentity({ ...value, model: "gpt" }, stored).model).toBe("sonnet")
	})
})

describe("newBotIdentity", () => {
	it("names a bot before it is named and gives it a face nobody wears", () => {
		expect(newBotIdentity([bot({ avatarAnimal: "cat" })])).toMatchObject({
			name: "New bot",
			title: "",
			description: "",
			instructions: "",
			avatarAnimal: "rabbit",
			avatarPose: "idle",
			avatarImagePath: null,
			workingDir: null,
		})
	})
})

describe("toRosterBots", () => {
	const roster = [
		bot({ id: "b-1", name: "Atlas", title: "Research" }),
		bot({ id: "b-2", name: "Beacon", title: "" }),
	]

	it("reads the name, the title and the face off the record", () => {
		const [atlas, beacon] = toRosterBots(roster, {
			selectedBotId: null,
			isWorking: false,
		})

		expect(atlas).toMatchObject({
			id: "b-1",
			name: "Atlas",
			title: "Research",
			animal: "owl",
			identity: "curious",
		})
		// A bot nobody gave a role draws no badge, which is a title left out rather
		// than an empty one passed through.
		expect(beacon.title).toBeUndefined()
	})

	// One process answers at a time, so the live half of the roster is the open bot's
	// and nobody else's row may claim it.
	it("gives the working state to the open bot alone", () => {
		const [atlas, beacon] = toRosterBots(roster, {
			selectedBotId: "b-1",
			isWorking: true,
			kind: "writing",
			lastMessage: "Pulled the three papers.",
		})

		expect(atlas).toMatchObject({
			status: "working",
			pose: "writing",
			lastMessage: "Pulled the three papers.",
		})
		expect(beacon).toMatchObject({ status: "idle", pose: undefined })
		expect(beacon.lastMessage).toBeUndefined()
	})

	it("passes an uploaded picture through and leaves a bot without one to its animal", () => {
		const [worn, drawn] = toRosterBots(
			[
				bot({ id: "b-1", avatarImagePath: "/pictures/owl.png" }),
				bot({ id: "b-2", avatarImagePath: null }),
			],
			{ selectedBotId: null, isWorking: false },
		)

		expect(worn.image).toBe(avatarSrc("/pictures/owl.png"))
		expect(drawn.image).toBeUndefined()
	})
})
