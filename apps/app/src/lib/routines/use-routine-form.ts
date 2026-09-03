import { useCallback, useMemo, useState } from "react"

import {
	EMPTY_ROUTINE_VALUES,
	type RoutineFormModel,
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

const revising =
	(routineId: string, revise: (model: RoutineFormModel) => RoutineFormModel) =>
	(current: RoutineFormModel | null) =>
		current && current.id === routineId ? revise(current) : current

export const useRoutineForm = ({
	conversationId,
	leadBotId,
	sources,
	held,
	onWritten,
	onWriteFailure,
}: RoutineFormWiring): RoutinesPanelForm => {
	const [open, setOpen] = useState<RoutineFormModel | null>(null)

	const readKey = useCallback((routineId: string) => {
		void routinesTransport.key(routineId).then(
			(read) =>
				setOpen(
					revising(routineId, (model) => ({
						...model,
						webhook: toWebhook(read),
					})),
				),
			() =>
				setOpen(
					revising(routineId, (model) => ({
						...model,
						hasFailedToReadKey: true,
					})),
				),
		)
	}, [])

	const show = useCallback(
		(routine: Routine) => {
			setOpen({ id: routine.id, values: toFormValues(routine) })
			if (isWebhook(routine)) {
				readKey(routine.id)
			}
		},
		[readKey],
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

			const written = open.id === null ? create(values) : edit(open.id, values)
			if (!written) {
				return
			}

			void written.then(
				(routine) => {
					onWritten(routine)
					show(routine)
				},
				(reason) => {
					const refusal = toFormRefusal(reason)
					setOpen({ ...open, values, refusal: refusal ?? undefined })
					if (!refusal) {
						onWriteFailure()
					}
				},
			)
		},
		[open, create, edit, onWritten, onWriteFailure, show],
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
		() => setOpen({ id: null, values: EMPTY_ROUTINE_VALUES }),
		[],
	)

	const close = useCallback(() => setOpen(null), [])

	return useMemo(
		() => ({
			open,
			sources,
			canCreate: sources.length > 0,
			onNew: openNew,
			onOpen: openRoutine,
			onClose: close,
			onSave: save,
		}),
		[open, sources, openNew, openRoutine, close, save],
	)
}
