import { describe, expect, it } from "vitest"

import {
	holdsAReference,
	placeholderFor,
	referencesIn,
	referencesInDeclaration,
} from "@workspace/ui/lib/secret-reference"
import {
	REFERENCE_CASES,
	ROUND_TRIP_KEYS,
} from "@workspace/ui/lib/secret-reference-cases"

describe("the secret reference grammar", () => {
	it.each(REFERENCE_CASES)("reads $text", ({ text, keys }) => {
		expect(referencesIn(text)).toEqual(keys)
		expect(holdsAReference(text)).toBe(keys.length > 0)
	})

	it.each(ROUND_TRIP_KEYS)("round-trips %s", (key) => {
		expect(referencesIn(placeholderFor(key))).toEqual([key])
	})

	it("gathers a reference from every field of a declaration", () => {
		const keys = referencesInDeclaration({
			command: placeholderFor("a.env.CMD"),
			args: ["--token", placeholderFor("a.args.1")],
			url: `https://x/sse?k=${placeholderFor("a.url.k")}`,
			env: { TOKEN: placeholderFor("a.env.TOKEN") },
			headers: { Authorization: `Bearer ${placeholderFor("a.headers.A")}` },
			nested: { deeper: [placeholderFor("a.env.DEEP")] },
		})

		expect(keys.toSorted()).toEqual([
			"a.args.1",
			"a.env.CMD",
			"a.env.DEEP",
			"a.env.TOKEN",
			"a.headers.A",
			"a.url.k",
		])
	})
})
