export const FIELD_TYPES = ["string", "number", "boolean", "datetime"] as const

export type FieldType = (typeof FIELD_TYPES)[number]

export const FILTER_OPERATORS = [
	"exists",
	"not_exists",
	"equals",
	"not_equals",
	"contains",
	"not_contains",
	"starts_with",
	"ends_with",
	"gt",
	"lt",
] as const

export type FilterOperator = (typeof FILTER_OPERATORS)[number]

export const FILTER_MATCH_MODES = ["all", "any"] as const

export type FilterMatchMode = (typeof FILTER_MATCH_MODES)[number]

export const OPERATORS_BY_FIELD_TYPE: Record<
	FieldType,
	readonly FilterOperator[]
> = {
	string: [
		"exists",
		"not_exists",
		"equals",
		"not_equals",
		"contains",
		"not_contains",
		"starts_with",
		"ends_with",
	],
	number: ["exists", "not_exists", "equals", "not_equals", "gt", "lt"],
	boolean: ["exists", "not_exists", "equals", "not_equals"],
	datetime: ["exists", "not_exists", "gt", "lt"],
}
