import { describe, expect, it } from "vitest"

import {
	addresseesIn,
	type MentionBot,
	mentionQueryIn,
	promptWithMention,
	toMentionTokens,
} from "./mentions"

const BOTS: MentionBot[] = [
	{ id: "ada", name: "Ada" },
	{ id: "adam", name: "Adam Smith" },
	{ id: "nyx", name: "Nyx" },
]

describe("toMentionTokens", () => {
	it("turns a name written behind an arobase into the token of that bot", () => {
		expect(toMentionTokens("@Ada take the walls", BOTS)).toBe(
			"<@ada> take the walls",
		)
	})

	it("reads the longest name so a shorter one does not swallow it", () => {
		expect(toMentionTokens("@Adam Smith and @Ada", BOTS)).toBe(
			"<@adam> and <@ada>",
		)
	})

	it("reads a name whatever its case", () => {
		expect(toMentionTokens("@nyx", BOTS)).toBe("<@nyx>")
	})

	it("leaves an arobase that names nobody alone", () => {
		expect(toMentionTokens("write to me@example.com", BOTS)).toBe(
			"write to me@example.com",
		)
	})

	it("leaves a token already written alone", () => {
		expect(toMentionTokens("<@ada> again", BOTS)).toBe("<@ada> again")
	})
})

describe("addresseesIn", () => {
	it("names the bots in the order they are named, once each", () => {
		expect(
			addresseesIn("<@nyx> and <@ada> and <@nyx>", ["ada", "nyx"]),
		).toEqual(["nyx", "ada"])
	})

	it("drops a token pointing at a bot that is not present", () => {
		expect(addresseesIn("<@ghost> <@ada>", ["ada"])).toEqual(["ada"])
	})

	it("names nobody when no token is written", () => {
		expect(addresseesIn("and now?", ["ada"])).toEqual([])
	})
})

describe("mentionQueryIn", () => {
	it("reads the draft behind the last arobase", () => {
		expect(mentionQueryIn("hello @ad")).toBe("ad")
	})

	it("opens on a bare arobase", () => {
		expect(mentionQueryIn("@")).toBe("")
	})

	it("stays shut when the arobase sits inside a word", () => {
		expect(mentionQueryIn("me@example")).toBeNull()
	})

	it("stays shut once the draft is over", () => {
		expect(mentionQueryIn("@Ada take")).toBeNull()
	})
})

describe("promptWithMention", () => {
	it("writes the name taken in place of the draft", () => {
		expect(promptWithMention("hello @ad", "Adam Smith")).toBe(
			"hello @Adam Smith ",
		)
	})

	it("leaves the prompt alone when no draft is open", () => {
		expect(promptWithMention("hello", "Ada")).toBe("hello")
	})
})
