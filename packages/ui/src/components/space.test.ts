import { describe, expect, it } from "vitest"

import {
	type Space,
	spaceAtRank,
	spaceBeside,
} from "@workspace/ui/components/space"

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

describe("spaceBeside", () => {
	it("reads the space one step along", () => {
		expect(spaceBeside(SPACES, "vocca", 1)?.id).toBe("atelier")
		expect(spaceBeside(SPACES, "vocca", -1)?.id).toBe("perso")
	})

	it("stops at either end instead of wrapping", () => {
		expect(spaceBeside(SPACES, "perso", -1)).toBeUndefined()
		expect(spaceBeside(SPACES, "atelier", 1)).toBeUndefined()
	})

	it("answers nothing when the selection is not in the list", () => {
		expect(spaceBeside(SPACES, "ghost", 1)).toBeUndefined()
		expect(spaceBeside(SPACES, undefined, 1)).toBeUndefined()
	})
})
