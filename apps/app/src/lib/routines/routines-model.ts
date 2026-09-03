import type {
	RoutineFormRefusal,
	RoutineFormValues,
	RoutineTriggerKind,
	RoutineTriggerSource,
	RoutineWebhook,
} from "@workspace/ui/components/routine-form"
import type { RoutineRowModel } from "@workspace/ui/components/routine-row"

import type { Routine, RoutineKey } from "./routine-contract"
import type { TriggerSource } from "./trigger-contract"

export type SourceTitles = ReadonlyMap<string, string>

export const sourceKeyOf = (botId: string, triggerSourceId: string) =>
	`${botId}/${triggerSourceId}`

export const botIdsOf = (routines: Routine[]): string[] => [
	...new Set(routines.map((routine) => routine.botId)),
]

export const toSourceTitles = (
	declared: { botId: string; sources: TriggerSource[] }[],
): SourceTitles =>
	new Map(
		declared.flatMap(({ botId, sources }) =>
			sources.map(
				(source) => [sourceKeyOf(botId, source.id), source.title] as const,
			),
		),
	)

export const toRoutineRows = (
	routines: Routine[],
	titles: SourceTitles,
): RoutineRowModel[] =>
	routines.map((routine) => ({
		id: routine.id,
		title: routine.title,
		triggerSourceTitle:
			titles.get(sourceKeyOf(routine.botId, routine.triggerSourceId)) ??
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

export const toTriggerSources = (
	declared: TriggerSource[],
): RoutineTriggerSource[] =>
	declared.map(({ id, title }) => ({ id, title, kind: triggerKindOf(id) }))

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

const refusalIn = (reason: unknown): { kind: string; field?: string } | null =>
	typeof reason === "object" && reason !== null && "kind" in reason
		? (reason as { kind: string; field?: string })
		: null

export const toFormRefusal = (reason: unknown): RoutineFormRefusal | null => {
	const refused = refusalIn(reason)
	if (!refused) {
		return null
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
