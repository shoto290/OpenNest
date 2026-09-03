import type { RoutineRowModel } from "@workspace/ui/components/routine-row"

import type { Routine } from "./routine-contract"
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
