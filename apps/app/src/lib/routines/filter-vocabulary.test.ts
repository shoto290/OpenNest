import { describe, expect, it } from "vitest"

import {
	FIELD_TYPES,
	FILTER_MATCH_MODES,
	FILTER_OPERATORS,
	OPERATORS_BY_FIELD_TYPE,
} from "./filter-vocabulary"

import declared from "../../../shared/filter-vocabulary.json?raw"

const vocabulary: {
	fieldTypes: string[]
	operatorsByFieldType: Record<string, string[]>
	matchModes: string[]
} = JSON.parse(declared)

const sorted = (names: readonly string[]) => [...names].sort()

describe("the shared filter vocabulary", () => {
	it("holds the field types the front declares", () => {
		expect(sorted(FIELD_TYPES)).toEqual(sorted(vocabulary.fieldTypes))
	})

	it("holds the match modes the front declares", () => {
		expect(sorted(FILTER_MATCH_MODES)).toEqual(sorted(vocabulary.matchModes))
	})

	it("covers every field type, and no operator the front misses", () => {
		const table = vocabulary.operatorsByFieldType

		expect(sorted(Object.keys(table))).toEqual(sorted(FIELD_TYPES))
		expect(sorted(FILTER_OPERATORS)).toEqual(
			sorted([...new Set(Object.values(table).flat())]),
		)
	})

	it.each(FIELD_TYPES)(
		"gives %s the operators the front accepts",
		(fieldType) => {
			expect(sorted(OPERATORS_BY_FIELD_TYPE[fieldType])).toEqual(
				sorted(vocabulary.operatorsByFieldType[fieldType] ?? []),
			)
		},
	)
})
