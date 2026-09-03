import type {
	RoutineFieldType,
	RoutineFilterMatchMode,
	RoutineFilterOperator,
} from "@workspace/ui/components/routine-form"

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

export const OPERATOR_TAKES_VALUE: Record<FilterOperator, boolean> = {
	exists: false,
	not_exists: false,
	equals: true,
	not_equals: true,
	contains: true,
	not_contains: true,
	starts_with: true,
	ends_with: true,
	gt: true,
	lt: true,
}

type Drift<A, B> = Exclude<A, B> | Exclude<B, A>

type FilterVocabularyDrift =
	| Drift<FieldType, RoutineFieldType>
	| Drift<FilterOperator, RoutineFilterOperator>
	| Drift<FilterMatchMode, RoutineFilterMatchMode>

export const NO_FILTER_VOCABULARY_DRIFT: Record<FilterVocabularyDrift, never> =
	{}
