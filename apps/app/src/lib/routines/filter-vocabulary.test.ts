import { describe, expect, it } from "vitest"

import { FIELD_TYPES, FILTER_OPERATORS } from "./filter-vocabulary"

import declared from "../../../shared/filter-vocabulary.json?raw"

const vocabulary: {
	fieldTypes: string[]
	operatorsByFieldType: Record<string, string[]>
} = JSON.parse(declared)

const sorted = (names: readonly string[]) => [...names].sort()

describe("the shared filter vocabulary", () => {
	it("holds the field types the front declares", () => {
		expect(sorted(FIELD_TYPES)).toEqual(sorted(vocabulary.fieldTypes))
	})

	it("gives every field type its operators, and no operator the front misses", () => {
		const table: Record<string, string[]> = vocabulary.operatorsByFieldType

		expect(sorted(Object.keys(table))).toEqual(sorted(FIELD_TYPES))
		expect(sorted(FILTER_OPERATORS)).toEqual(
			sorted([...new Set(Object.values(table).flat())]),
		)
	})
})
