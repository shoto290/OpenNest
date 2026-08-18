import { describe, expect, it } from "vitest"

import {
	FALLBACK_MODELS,
	modelOptionsFor,
	newBotIdentity,
	toIdentity,
	toRosterBots,
	toSettingsValue,
} from "./bot-settings"

import { avatarSrc } from "../host"
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

	// A model label is not a vocabulary this side polices: there is no listing to
	// check one against, so what the panel emitted is what the store is told —
	// alias, versioned name or something this build has never seen.
	it("writes the model label it was given, whatever it is", () => {
		const value = toSettingsValue(stored)

		for (const model of [...FALLBACK_MODELS, "claude-opus-4-1-20250805"]) {
			expect(toIdentity({ ...value, model }, stored).model).toBe(model)
		}
	})
})

describe("modelOptionsFor", () => {
	/** What a machine answers: grouped by tier with the tier's alias first, and a tier
	 * nothing in this repository names. The point is that nothing here has to. */
	const CATALOGUE = [
		"quasar",
		"quasar[1m]",
		"claude-quasar-5",
		"claude-quasar-4-1",
		"sonnet",
		"claude-sonnet-5",
		"best",
	]

	it("offers what the machine carries, in the order it was given", () => {
		expect(
			modelOptionsFor("sonnet", CATALOGUE).map((option) => option.value),
		).toEqual(CATALOGUE)
	})

	// Every label is its value: these are the words Claude Code takes, and a tier this
	// build never heard of has no friendly name to be given.
	it("labels every value with itself", () => {
		expect(modelOptionsFor("quasar", CATALOGUE)).toContainEqual({
			label: "claude-quasar-5",
			value: "claude-quasar-5",
		})
	})

	// The floor, for a machine with no executable to read: the four tier aliases.
	it("falls back to the aliases every build knows when nothing was read", () => {
		expect(modelOptionsFor("sonnet", []).map((option) => option.value)).toEqual(
			FALLBACK_MODELS,
		)
	})

	// A bot on a label nothing offers still has to be readable in its own settings,
	// and selecting another field must not be what moves it off that label.
	it("offers a label of its own back so the bot can be seen on it", () => {
		const read = modelOptionsFor("claude-mythos-preview", CATALOGUE)
		const fallen = modelOptionsFor("claude-mythos-preview", [])

		expect(read).toHaveLength(CATALOGUE.length + 1)
		expect(read.at(-1)).toEqual({
			label: "claude-mythos-preview",
			value: "claude-mythos-preview",
		})
		expect(fallen.at(-1)?.value).toBe("claude-mythos-preview")
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

	// An alias follows its tier; a versioned name pins the bot to whatever was
	// current the day it was made.
	it("records an alias rather than a versioned name", () => {
		const { model } = newBotIdentity([])

		expect(FALLBACK_MODELS).toContain(model)
		expect(model).not.toMatch(/\d/)
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
			working: {},
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

	// Every bot runs a process of its own, so every row reads its own: the bot the
	// reader is not looking at is shown answering when it is. The preview line stays
	// the open bot's — it is the conversation on the screen.
	it("gives every bot the working state of its own process", () => {
		const [atlas, beacon] = toRosterBots(roster, {
			selectedBotId: "b-1",
			working: {
				"b-1": { isWorking: true, kind: "writing" },
				"b-2": { isWorking: true, kind: "searching" },
			},
			lastMessage: "Pulled the three papers.",
		})

		expect(atlas).toMatchObject({
			status: "working",
			pose: "writing",
			lastMessage: "Pulled the three papers.",
		})
		expect(beacon).toMatchObject({ status: "working", pose: "searching" })
		expect(beacon.lastMessage).toBeUndefined()
	})

	it("leaves a bot with no process of its own idle", () => {
		const [atlas, beacon] = toRosterBots(roster, {
			selectedBotId: "b-1",
			working: { "b-1": { isWorking: false } },
		})

		expect(atlas).toMatchObject({ status: "idle", pose: undefined })
		expect(beacon).toMatchObject({ status: "idle", pose: undefined })
	})

	it("passes an uploaded picture through and leaves a bot without one to its animal", () => {
		const [worn, drawn] = toRosterBots(
			[
				bot({ id: "b-1", avatarImagePath: "/pictures/owl.png" }),
				bot({ id: "b-2", avatarImagePath: null }),
			],
			{ selectedBotId: null, working: {} },
		)

		expect(worn.image).toBe(avatarSrc("/pictures/owl.png"))
		expect(drawn.image).toBeUndefined()
	})
})
