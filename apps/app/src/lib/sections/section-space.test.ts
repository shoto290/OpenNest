import { describe, expect, it } from "vitest"

import { spaceForNewSection } from "./section-space"

const rosters = {
	personal: [{ id: "bean" }],
	vocca: [{ id: "biscuit" }],
}

describe("spaceForNewSection", () => {
	it("names the space holding the bot the section is created for", () => {
		expect(
			spaceForNewSection({
				rosters,
				shownSpaceId: "personal",
				botId: "biscuit",
			}),
		).toBe("vocca")
	})

	it("names the space being shown when no bot is named", () => {
		expect(spaceForNewSection({ rosters, shownSpaceId: "personal" })).toBe(
			"personal",
		)
	})

	it("names no space when no roster holds the bot", () => {
		expect(
			spaceForNewSection({ rosters, shownSpaceId: "personal", botId: "gone" }),
		).toBeUndefined()
	})

	it("names no space when nothing is shown and no bot is named", () => {
		expect(spaceForNewSection({ rosters, shownSpaceId: null })).toBeUndefined()
	})
})
