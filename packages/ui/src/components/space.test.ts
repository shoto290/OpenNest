import { describe, expect, it } from "vitest"

import { type Space, spaceAtRank } from "@workspace/ui/components/space"

const SPACES: Space[] = [
	{ id: "perso", name: "Perso", colour: "blue" },
	{ id: "vocca", name: "Vocca", colour: "green" },
	{ id: "atelier", name: "Atelier", colour: "pink" },
]

describe("spaceAtRank", () => {
	it("counts from one", () => {
		expect(spaceAtRank(SPACES, 1)?.id).toBe("perso")
		expect(spaceAtRank(SPACES, 3)?.id).toBe("atelier")
	})

	it("answers nothing for a rank no space fills", () => {
		expect(spaceAtRank(SPACES, 4)).toBeUndefined()
		expect(spaceAtRank([], 1)).toBeUndefined()
	})
})
