import { describe, expect, it } from "bun:test"

import {
	holdsAReference,
	placeholderFor,
	referencesIn,
} from "@workspace/ui/lib/secret-reference"
import {
	REFERENCE_CASES,
	ROUND_TRIP_KEYS,
} from "@workspace/ui/lib/secret-reference-cases"

describe("the secret reference grammar, as the sidecar reads it", () => {
	for (const { text, keys } of REFERENCE_CASES) {
		it(`reads ${JSON.stringify(text)}`, () => {
			expect(referencesIn(text)).toEqual(keys)
			expect(holdsAReference(text)).toBe(keys.length > 0)
		})
	}

	for (const key of ROUND_TRIP_KEYS) {
		it(`round-trips ${key}`, () => {
			expect(referencesIn(placeholderFor(key))).toEqual([key])
		})
	}
})
