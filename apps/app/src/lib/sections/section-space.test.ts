import { describe, expect, it } from "vitest"

import { newSectionFor } from "./section-space"

const rosters = {
	personal: [{ id: "bean" }],
	vocca: [{ id: "biscuit" }],
}

const conversationRosters = {
	personal: [{ id: "standup" }],
}

describe("newSectionFor", () => {
	it("names the space holding the bot the section is created for", () => {
		expect(
			newSectionFor({ rosters, shownSpaceId: "personal", rowId: "biscuit" }),
		).toEqual({ spaceId: "vocca", botId: "biscuit", conversationId: null })
	})

	it("names the space holding the conversation the section is created for", () => {
		expect(
			newSectionFor({
				rosters,
				conversationRosters,
				shownSpaceId: "vocca",
				rowId: "standup",
			}),
		).toEqual({
			spaceId: "personal",
			botId: null,
			conversationId: "standup",
		})
	})

	it("names the space being shown when no row is named", () => {
		expect(newSectionFor({ rosters, shownSpaceId: "personal" })).toEqual({
			spaceId: "personal",
			botId: null,
			conversationId: null,
		})
	})

	it("names no space when no roster holds the row", () => {
		expect(
			newSectionFor({ rosters, shownSpaceId: "personal", rowId: "gone" }),
		).toBeUndefined()
	})

	it("names no space when nothing is shown and no row is named", () => {
		expect(newSectionFor({ rosters, shownSpaceId: null })).toBeUndefined()
	})
})
