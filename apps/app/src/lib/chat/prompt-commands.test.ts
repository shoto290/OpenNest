import { describe, expect, it } from "vitest"

import {
	commandOptionsFor,
	commandQueryIn,
	holdsDismissal,
	promptForCommand,
} from "./prompt-commands"

const COMMANDS = ["clear", "compact", "review"]

describe("commandQueryIn", () => {
	it("opens on a slash and hands back what follows it", () => {
		expect(commandQueryIn("/", COMMANDS)).toBe("")
		expect(commandQueryIn("/rev", COMMANDS)).toBe("rev")
		expect(commandQueryIn("/release-notes", COMMANDS)).toBe("release-notes")
	})

	it("stays shut on every other shape", () => {
		for (const prompt of [
			"",
			"review",
			" /review",
			"/review ",
			"/review the diff",
			"/review\n",
			"what about /review",
		]) {
			expect(commandQueryIn(prompt, COMMANDS)).toBeNull()
		}
	})

	it("stays shut while the session has announced no command", () => {
		expect(commandQueryIn("/", [])).toBeNull()
		expect(commandQueryIn("/rev", [])).toBeNull()
	})
})

describe("commandOptionsFor", () => {
	it("lists the announced names the way the reader types them", () => {
		expect(commandOptionsFor(COMMANDS)).toEqual([
			"/clear",
			"/compact",
			"/review",
		])
	})
})

describe("promptForCommand", () => {
	it("leaves the command and the space that follows it", () => {
		expect(promptForCommand("/review")).toBe("/review ")
	})
})

describe("holdsDismissal", () => {
	/** The drafts the reader writes after dismissing the menu, in order. */
	function afterDismissal(drafts: string[]): boolean {
		return drafts.reduce(
			(held, draft) => holdsDismissal(held, commandQueryIn(draft, COMMANDS)),
			true,
		)
	}

	it("holds over every draft that stays in the command shape", () => {
		expect(afterDismissal(["/co"])).toBe(true)
		expect(afterDismissal(["/comp", "/co"])).toBe(true)
		expect(afterDismissal(["/co", "/"])).toBe(true)
	})

	it("rearms once the draft leaves the command shape", () => {
		expect(afterDismissal(["/co review"])).toBe(false)
		expect(afterDismissal([""])).toBe(false)
	})

	it("offers the menu again to a draft written after it rearmed", () => {
		expect(afterDismissal(["", "/co"])).toBe(false)
	})

	it("holds nothing while the reader dismissed nothing", () => {
		expect(holdsDismissal(false, "co")).toBe(false)
	})
})
