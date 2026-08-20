import { describe, expect, it } from "vitest"

import {
	BOT_NAMES,
	changesRuntime,
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
					instructions: "Answer briefly.",
					model: "haiku",
					avatarAnimal: "owl",
					avatarBlot: "moss",
					workingDir: "/work/opennest",
				}),
			),
		).toEqual({
			identity: { animal: "owl", blot: "moss", image: undefined },
			name: "Nyx",
			title: "Reviewer",
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

	// A bot nobody marked is a bare animal, not an animal on a default tint: the
	// picker opens on "No blot" and the avatar draws nothing behind it.
	it("reads a bot nobody marked as wearing no blot", () => {
		expect(
			toSettingsValue(bot({ avatarBlot: null })).identity.blot,
		).toBeUndefined()
	})
})

describe("changesRuntime", () => {
	const stored = bot({
		instructions: "Answer briefly.",
		workingDir: "/work/opennest",
	})
	const value = toSettingsValue(stored)

	// The two a child is started with and can never be told afterwards.
	it("says so for the instructions and for the directory", () => {
		expect(
			changesRuntime(stored, { ...value, instructions: "Answer at length." }),
		).toBe(true)
		expect(
			changesRuntime(stored, { ...value, workingDirectory: "/work/other" }),
		).toBe(true)
	})

	// Everything else about a bot is read where it is shown, or travels with the
	// next prompt: none of it is worth a process.
	it("says nothing for a field the process was never started with", () => {
		expect(changesRuntime(stored, value)).toBe(false)
		expect(changesRuntime(stored, { ...value, name: "Nyx" })).toBe(false)
		expect(changesRuntime(stored, { ...value, model: "haiku" })).toBe(false)
		expect(
			changesRuntime(stored, {
				...value,
				identity: { animal: "owl", blot: "sky" },
			}),
		).toBe(false)
	})

	// The field is text and the column is an absence: a directory emptied to spaces
	// is a bot naming none, and one that never named any is unchanged by them.
	it("reads a directory emptied to spaces the way the store stores it", () => {
		expect(changesRuntime(stored, { ...value, workingDirectory: "   " })).toBe(
			true,
		)
		expect(
			changesRuntime(bot({ workingDir: null }), {
				...toSettingsValue(bot({ workingDir: null })),
				workingDirectory: "   ",
			}),
		).toBe(false)
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
				{ ...value, identity: { animal: "bear", blot: "amber" } },
				stored,
			),
		).toMatchObject({
			avatarAnimal: "bear",
			avatarBlot: "amber",
			avatarImagePath: null,
		})
	})

	// Clearing the blot is the picker emitting an identity with none, and the store
	// keeps that as the absence it is rather than as a tint named "none".
	it("writes a blot the reader cleared as an absence", () => {
		const value = toSettingsValue(stored)

		expect(
			toIdentity({ ...value, identity: { animal: "owl" } }, stored).avatarBlot,
		).toBeNull()
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
	const rosterCarrying = (names: readonly string[]): Bot[] =>
		names.map((name, index) => bot({ id: `b-${index}`, name }))

	it("names a bot before it is named and gives it a face nobody wears", () => {
		const created = newBotIdentity([bot({ avatarAnimal: "cat" })])

		expect(BOT_NAMES).toContain(created.name)
		expect(created).toMatchObject({
			title: "",
			instructions: "",
			avatarAnimal: "rabbit",
			avatarBlot: null,
			avatarImagePath: null,
			workingDir: null,
		})
	})

	it("offers at least thirty names to draw from", () => {
		expect(new Set(BOT_NAMES).size).toBeGreaterThanOrEqual(30)
	})

	it("draws a name nobody in the roster carries", () => {
		const [spared, ...carried] = BOT_NAMES

		expect(newBotIdentity(rosterCarrying(carried)).name).toBe(spared)
	})

	it("draws from the whole list once every name is carried", () => {
		expect(BOT_NAMES).toContain(newBotIdentity(rosterCarrying(BOT_NAMES)).name)
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

	/** The clock the rows below are labelled from, and a moment twelve hours behind
	 * the reading it takes. */
	const NOW = new Date(2025, 2, 12, 21, 30).getTime()
	const TODAY = new Date(2025, 2, 12, 9, 24).getTime()

	it("reads the name, the title and the face off the record", () => {
		const [atlas, beacon] = toRosterBots(
			roster,
			{ working: {}, previews: {} },
			NOW,
		)

		expect(atlas).toMatchObject({
			id: "b-1",
			name: "Atlas",
			title: "Research",
			animal: "owl",
			blot: "moss",
		})
		// A bot nobody gave a role draws no badge, which is a title left out rather
		// than an empty one passed through.
		expect(beacon.title).toBeUndefined()
	})

	// Every bot runs a process of its own, so every row reads its own: the bot the
	// reader is not looking at is shown answering when it is.
	it("gives every bot the working state of its own process", () => {
		const [atlas, beacon] = toRosterBots(
			roster,
			{
				working: {
					"b-1": { isWorking: true, kind: "writing" },
					"b-2": { isWorking: true, kind: "searching" },
				},
				previews: {},
			},
			NOW,
		)

		expect(atlas).toMatchObject({ status: "working", pose: "writing" })
		expect(beacon).toMatchObject({ status: "working", pose: "searching" })
	})

	// Every bot holds a conversation of its own, so every row previews its own last
	// word — the row the reader is not on included.
	it("gives every bot the last word of its own conversation", () => {
		const [atlas, beacon] = toRosterBots(
			roster,
			{
				working: {},
				previews: { "b-1": { text: "Pulled the three papers.", at: TODAY } },
			},
			NOW,
		)

		expect(atlas.lastMessage).toBe("Pulled the three papers.")
		// A bot nothing has been said to yet previews nothing, and the row keeps the
		// height it has with a preview.
		expect(beacon.lastMessage).toBeUndefined()
	})

	// The line and the time come off the same message, so a row can never date a
	// preview it is not showing.
	it("labels a row with the age of the word it previews", () => {
		const [atlas, beacon] = toRosterBots(
			roster,
			{
				working: {},
				previews: { "b-1": { text: "Pulled the three papers.", at: TODAY } },
			},
			NOW,
		)

		expect(atlas.timestamp).toBe("12h")
		expect(beacon.timestamp).toBeUndefined()
	})

	// A turn that ended without saying anything: the row has nothing to preview and
	// still says when the conversation last moved.
	it("labels a row whose last message said nothing", () => {
		const [atlas] = toRosterBots(
			roster,
			{ working: {}, previews: { "b-1": { at: TODAY } } },
			NOW,
		)

		expect(atlas.lastMessage).toBeUndefined()
		expect(atlas.timestamp).toBe("12h")
	})

	// One reading for the whole array: two rows a day apart are aged against the same
	// now, so they cannot both be read as hours old.
	it("labels every row of one roster from the one clock it was given", () => {
		const [atlas, beacon] = toRosterBots(
			roster,
			{
				working: {},
				previews: {
					"b-1": { text: "Today", at: TODAY },
					"b-2": { text: "A day back", at: new Date(2025, 2, 11).getTime() },
				},
			},
			NOW,
		)

		expect(atlas.timestamp).toBe("12h")
		expect(beacon.timestamp).toBe("1d")
	})

	it("leaves a bot with no process of its own idle", () => {
		const [atlas, beacon] = toRosterBots(
			roster,
			{ working: { "b-1": { isWorking: false } }, previews: {} },
			NOW,
		)

		expect(atlas).toMatchObject({ status: "idle", pose: undefined })
		expect(beacon).toMatchObject({ status: "idle", pose: undefined })
	})

	it("leaves a bot nobody marked without a blot rather than with a default one", () => {
		const [bare] = toRosterBots(
			[bot({ avatarBlot: null })],
			{ working: {}, previews: {} },
			NOW,
		)

		expect(bare.blot).toBeUndefined()
	})

	it("passes an uploaded picture through and leaves a bot without one to its animal", () => {
		const [worn, drawn] = toRosterBots(
			[
				bot({ id: "b-1", avatarImagePath: "/pictures/owl.png" }),
				bot({ id: "b-2", avatarImagePath: null }),
			],
			{ working: {}, previews: {} },
			NOW,
		)

		expect(worn.image).toBe(avatarSrc("/pictures/owl.png"))
		expect(drawn.image).toBeUndefined()
	})
})
