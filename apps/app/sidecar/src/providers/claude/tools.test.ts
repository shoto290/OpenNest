import { describe, expect, it } from "bun:test"

import { builtInTools } from "./tools"

describe("builtInTools", () => {
	it("keeps the install's own tools, in the order the session named them", () => {
		expect(builtInTools(["Task", "Bash", "Read", "Write"])).toEqual([
			"Task",
			"Bash",
			"Read",
			"Write",
		])
	})

	// A server is a bot's own, or the reader's: what it provides is not a built-in
	// the catalogue may offer to hold back.
	it("leaves out every tool an MCP server provides", () => {
		expect(
			builtInTools([
				"Bash",
				"mcp__context7__query-docs",
				"Read",
				"mcp__plugin_helper__write_html",
			]),
		).toEqual(["Bash", "Read"])
	})

	it("answers nothing for a session that named nothing", () => {
		expect(builtInTools([])).toEqual([])
	})
})
