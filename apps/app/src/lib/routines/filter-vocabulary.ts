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
