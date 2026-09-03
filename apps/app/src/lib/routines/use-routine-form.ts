import { useCallback, useMemo, useRef, useState } from "react"

import {
	EMPTY_ROUTINE_VALUES,
	type RoutineFormModel,
	type RoutineFormRefusal,
	type RoutineFormValues,
	type RoutineTriggerSource,
} from "@workspace/ui/components/routine-form"
import type { RoutinesPanelForm } from "@workspace/ui/components/routines-panel"

import type { Routine } from "./routine-contract"
import {
	toFormRefusal,
	toFormValues,
	toTriggerConfig,
	toWebhook,
	triggerKindOf,
} from "./routines-model"
import { routinesTransport } from "./routines-transport"

export type RoutineFormWiring = {
	conversationId: string
	leadBotId: string | undefined
	sources: RoutineTriggerSource[]
	held: Routine[]
	onWritten: (routine: Routine) => void
	onWriteFailure: () => void
}

const isWebhook = (routine: Routine) =>
	triggerKindOf(routine.triggerSourceId) === "localWebhook"

const sourcesOf = (
	open: RoutineFormModel | null,
	declared: RoutineTriggerSource[],
): RoutineTriggerSource[] => {
	const openSourceId = open?.id ? open.values.triggerSourceId : null
	if (!openSourceId || declared.some(({ id }) => id === openSourceId)) {
		return declared
	}

	return [
		...declared,
		{
			id: openSourceId,
			title: openSourceId,
			kind: triggerKindOf(openSourceId),
		},
	]
}

export const useRoutineForm = ({
	conversationId,
	leadBotId,
	sources,
	held,
	onWritten,
	onWriteFailure,
}: RoutineFormWiring): RoutinesPanelForm => {
	const [open, setOpen] = useState<RoutineFormModel | null>(null)
	const placed = useRef(0)

	const place = useCallback((model: RoutineFormModel | null) => {
		placed.current += 1
		setOpen(model)
	}, [])

	const revise = useCallback(
		(on: number, change: (model: RoutineFormModel) => RoutineFormModel) =>
			setOpen((current) =>
				current && on === placed.current ? change(current) : current,
			),
		[],
	)

	const readKey = useCallback(
		(routineId: string) => {
			const on = placed.current

			void routinesTransport.key(routineId).then(
				(carried) =>
					revise(on, (model) => ({ ...model, webhook: toWebhook(carried) })),
				() => revise(on, (model) => ({ ...model, hasFailedToReadKey: true })),
			)
		},
		[revise],
	)

	const show = useCallback(
		(routine: Routine) => {
			place({ id: routine.id, values: toFormValues(routine) })
			if (isWebhook(routine)) {
				readKey(routine.id)
			}
		},
		[place, readKey],
	)

	const create = useCallback(
		(values: RoutineFormValues) =>
			leadBotId
				? routinesTransport.create({
						conversationId,
						botId: leadBotId,
						title: values.title,
						instruction: values.instruction,
						triggerSourceId: values.triggerSourceId,
						filter: { matchMode: "all", rows: [] },
						triggerConfig: toTriggerConfig(values),
					})
				: null,
		[conversationId, leadBotId],
	)

	const edit = useCallback(
		(id: string, values: RoutineFormValues) => {
			const routine = held.find((candidate) => candidate.id === id)
			return routine
				? routinesTransport.update(id, {
						title: values.title,
						instruction: values.instruction,
						filter: routine.filter,
						triggerConfig: toTriggerConfig(values),
						isEnabled: routine.isEnabled,
					})
				: null
		},
		[held],
	)

	const save = useCallback(
		(values: RoutineFormValues) => {
			if (!open) {
				return
			}

			const on = placed.current
			const keepEntered = (refusal: RoutineFormRefusal | null) =>
				revise(on, (model) => ({
					...model,
					values,
					refusal: refusal ?? undefined,
				}))

			const written = open.id === null ? create(values) : edit(open.id, values)
			if (!written) {
				keepEntered(null)
				onWriteFailure()
				return
			}

			void written.then(
				(routine) => {
					onWritten(routine)
					if (on === placed.current) {
						show(routine)
					}
				},
				(reason) => {
					const refusal = on === placed.current ? toFormRefusal(reason) : null
					keepEntered(refusal)
					if (!refusal) {
						onWriteFailure()
					}
				},
			)
		},
		[open, create, edit, onWritten, onWriteFailure, revise, show],
	)

	const openRoutine = useCallback(
		(routineId: string) => {
			const routine = held.find((candidate) => candidate.id === routineId)
			if (routine) {
				show(routine)
			}
		},
		[held, show],
	)

	const openNew = useCallback(
		() => place({ id: null, values: EMPTY_ROUTINE_VALUES }),
		[place],
	)

	const close = useCallback(() => place(null), [place])

	return useMemo(
		() => ({
			open,
			sources: sourcesOf(open, sources),
			canCreate: sources.length > 0,
			onNew: openNew,
			onOpen: openRoutine,
			onClose: close,
			onSave: save,
		}),
		[open, sources, openNew, openRoutine, close, save],
	)
}
