import type {
	RoutineFilterRow,
	RoutineFilterValues,
	RoutineFormRefusal,
	RoutineFormValues,
	RoutineTriggerKind,
	RoutineTriggerSource,
	RoutineWebhook,
} from "@workspace/ui/components/routine-form"
import type { RoutineRowModel } from "@workspace/ui/components/routine-row"

import {
	FIELD_TYPES,
	FILTER_OPERATORS,
	type FieldType,
	OPERATOR_TAKES_VALUE,
} from "./filter-vocabulary"
import type { Routine, RoutineKey } from "./routine-contract"
import type {
	Filter,
	FilterRow,
	PayloadField,
	TriggerSource,
} from "./trigger-contract"

export type KnownSources = ReadonlyMap<string, TriggerSource>

export const sourceKeyOf = (botId: string, triggerSourceId: string) =>
	`${botId}/${triggerSourceId}`

export const botIdsOf = (routines: Routine[]): string[] => [
	...new Set(routines.map((routine) => routine.botId)),
]

export const toKnownSources = (
	declared: { botId: string; sources: TriggerSource[] }[],
): KnownSources =>
	new Map(
		declared.flatMap(({ botId, sources }) =>
			sources.map((source) => [sourceKeyOf(botId, source.id), source] as const),
		),
	)

export const toRoutineRows = (
	routines: Routine[],
	known: KnownSources,
): RoutineRowModel[] =>
	routines.map((routine) => ({
		id: routine.id,
		title: routine.title,
		triggerSourceTitle:
			known.get(sourceKeyOf(routine.botId, routine.triggerSourceId))?.title ??
			routine.triggerSourceId,
		isEnabled: routine.isEnabled,
		hasStoppedItself: !routine.isEnabled && routine.consecutiveFailures > 0,
	}))

const KINDS_BY_SOURCE_ID: Record<string, RoutineTriggerKind> = {
	schedule: "schedule",
	"file-watch": "fileWatch",
	"local-webhook": "localWebhook",
}

export const triggerKindOf = (triggerSourceId: string): RoutineTriggerKind =>
	KINDS_BY_SOURCE_ID[triggerSourceId] ?? "plain"

export const toTriggerSource = ({
	id,
	title,
	payload,
}: TriggerSource): RoutineTriggerSource => ({
	id,
	title,
	payload,
	kind: triggerKindOf(id),
})

export const toTriggerSources = (
	declared: TriggerSource[],
): RoutineTriggerSource[] => declared.map(toTriggerSource)

const typeOf = (fields: PayloadField[], field: string) =>
	fields.find((declared) => declared.name === field)?.type

const asNumber = (value: string) => {
	const held = Number(value)
	return value.trim() === "" || Number.isNaN(held) ? value : held
}

const written = (value: string, fieldType: FieldType | undefined) => {
	if (fieldType === "number") {
		return asNumber(value)
	}

	return fieldType === "boolean" ? value === "true" : value
}

const toFilterRow = (
	row: RoutineFilterRow,
	fields: PayloadField[],
): FilterRow => {
	const { field, operator } = row
	return OPERATOR_TAKES_VALUE[operator]
		? { field, operator, value: written(row.value, typeOf(fields, field)) }
		: { field, operator }
}

const asRead = (row: RoutineFilterRow, read: FilterRow[]) =>
	read.find((held) => isSameRow(row, toFormRow(held)))

export const toFilter = (
	filter: RoutineFilterValues,
	fields: PayloadField[],
	read?: Filter,
): Filter => ({
	matchMode: filter.matchMode,
	rows: filter.rows.map(
		(row) => asRead(row, read?.rows ?? []) ?? toFilterRow(row, fields),
	),
})

const toFormRow = ({
	field,
	operator,
	value,
}: FilterRow): RoutineFilterRow => ({
	field,
	operator,
	value: value === undefined ? "" : String(value),
})

const isSameRow = (row: RoutineFilterRow, held: RoutineFilterRow) =>
	row.field === held.field &&
	row.operator === held.operator &&
	row.value === held.value

export const toFormFilter = (filter: Filter): RoutineFilterValues => ({
	matchMode: filter.matchMode,
	rows: filter.rows.map(toFormRow),
})

const textIn = (triggerConfig: unknown, field: string): string => {
	if (typeof triggerConfig !== "object" || triggerConfig === null) {
		return ""
	}

	const held = (triggerConfig as Record<string, unknown>)[field]
	return typeof held === "string" ? held : ""
}

export const toFormValues = (routine: Routine): RoutineFormValues => ({
	title: routine.title,
	instruction: routine.instruction,
	triggerSourceId: routine.triggerSourceId,
	expression: textIn(routine.triggerConfig, "expression"),
	path: textIn(routine.triggerConfig, "path"),
	filter: toFormFilter(routine.filter),
})

export const toTriggerConfig = (values: RoutineFormValues): unknown => {
	const kind = triggerKindOf(values.triggerSourceId)
	if (kind === "schedule") {
		return { expression: values.expression }
	}

	return kind === "fileWatch" ? { path: values.path } : {}
}

const REFUSALS_BY_BLANK_FIELD: Record<string, RoutineFormRefusal> = {
	title: "blankTitle",
	instruction: "blankInstruction",
}

type RefusalReason = {
	kind: string
	field?: string
	row?: number
	operator?: string
	fieldType?: string
}

const refusalIn = (reason: unknown): RefusalReason | null =>
	typeof reason === "object" && reason !== null && "kind" in reason
		? (reason as RefusalReason)
		: null

const toOperatorRefusal = ({
	row,
	operator,
	fieldType,
}: RefusalReason): RoutineFormRefusal | null => {
	const refusedOperator = FILTER_OPERATORS.find((held) => held === operator)
	const refusedType = FIELD_TYPES.find((held) => held === fieldType)

	return typeof row === "number" && refusedOperator && refusedType
		? { row, operator: refusedOperator, fieldType: refusedType }
		: null
}

export const toFormRefusal = (reason: unknown): RoutineFormRefusal | null => {
	const refused = refusalIn(reason)
	if (!refused) {
		return null
	}

	if (refused.kind === "unsupportedOperator") {
		return toOperatorRefusal(refused)
	}

	if (refused.kind === "unreadableExpression") {
		return "unreadableExpression"
	}

	return refused.kind === "blankField"
		? (REFUSALS_BY_BLANK_FIELD[refused.field ?? ""] ?? null)
		: null
}

export const toWebhook = ({
	url,
	key,
	header,
}: RoutineKey): RoutineWebhook => ({
	url: url ?? "",
	key,
	header: header ?? "",
})
