import { useCallback, useEffect, useMemo, useState } from "react"

import type { RoutineTriggerSource } from "@workspace/ui/components/routine-form"
import type { RoutineRowModel } from "@workspace/ui/components/routine-row"
import type {
	RoutinesFailure,
	RoutinesPanelForm,
} from "@workspace/ui/components/routines-panel"

import type { Routine } from "./routine-contract"
import {
	botIdsOf,
	type SourceTitles,
	toRoutineRows,
	toSourceTitles,
	toTriggerSources,
} from "./routines-model"
import { routinesTransport } from "./routines-transport"
import type { TriggerSource } from "./trigger-contract"
import { triggerSourcesTransport } from "./trigger-sources-transport"
import { useRoutineForm } from "./use-routine-form"

const withoutWriteFailure = (current: RoutinesFailure | null) =>
	current === "write" ? null : current

const NO_ROUTINES: Routine[] = []
const NO_TITLES: SourceTitles = new Map()
const NO_SOURCES: RoutineTriggerSource[] = []

export type ConversationRoutines = {
	routines: RoutineRowModel[]
	failure: RoutinesFailure | null
	reload: () => void
	setEnabled: (id: string, isEnabled: boolean) => void
	remove: (id: string) => Promise<void>
	form: RoutinesPanelForm
}

type Declaration = { botId: string; sources: TriggerSource[] }

const declaredBy = async (botIds: string[]): Promise<Declaration[]> => {
	const reads = await Promise.allSettled(
		botIds.map(async (botId) => ({
			botId,
			sources: await triggerSourcesTransport.sources(botId),
		})),
	)

	return reads.flatMap((read) =>
		read.status === "fulfilled" ? [read.value] : [],
	)
}

const declaredByLead = (leadBotId: string | undefined) =>
	leadBotId ? triggerSourcesTransport.sources(leadBotId) : Promise.resolve([])

export const useRoutines = (
	conversationId: string,
	leadBotId?: string,
): ConversationRoutines => {
	const [held, setHeld] = useState<Routine[]>(NO_ROUTINES)
	const [titles, setTitles] = useState<SourceTitles>(NO_TITLES)
	const [sources, setSources] = useState<RoutineTriggerSource[]>(NO_SOURCES)
	const [failure, setFailure] = useState<RoutinesFailure | null>(null)

	const reload = useCallback(() => {
		void Promise.all([
			routinesTransport.list(conversationId),
			declaredByLead(leadBotId),
		]).then(
			async ([listed, lead]) => {
				const others = await declaredBy(
					botIdsOf(listed).filter((botId) => botId !== leadBotId),
				)
				setTitles(
					toSourceTitles(
						leadBotId
							? [{ botId: leadBotId, sources: lead }, ...others]
							: others,
					),
				)
				setSources(toTriggerSources(lead))
				setHeld(listed)
				setFailure(null)
			},
			() => setFailure("read"),
		)
	}, [conversationId, leadBotId])

	useEffect(reload, [reload])

	const setEnabled = useCallback(
		(id: string, isEnabled: boolean) => {
			const routine = held.find((candidate) => candidate.id === id)
			if (!routine) {
				return
			}

			void routinesTransport
				.update(id, {
					title: routine.title,
					instruction: routine.instruction,
					filter: routine.filter,
					triggerConfig: routine.triggerConfig,
					isEnabled,
				})
				.then(
					(written) => {
						setHeld((rows) =>
							rows.map((row) => (row.id === written.id ? written : row)),
						)
						setFailure(withoutWriteFailure)
					},
					() => setFailure("write"),
				)
		},
		[held],
	)

	const remove = useCallback(
		(id: string) =>
			routinesTransport.delete(id).then(() => {
				setHeld((rows) => rows.filter((row) => row.id !== id))
				setFailure(withoutWriteFailure)
			}),
		[],
	)

	const hold = useCallback((written: Routine) => {
		setHeld((rows) =>
			rows.some((row) => row.id === written.id)
				? rows.map((row) => (row.id === written.id ? written : row))
				: [...rows, written],
		)
		setFailure(withoutWriteFailure)
	}, [])

	const raiseWriteFailure = useCallback(() => setFailure("write"), [])

	const form = useRoutineForm({
		conversationId,
		leadBotId,
		sources,
		held,
		onWritten: hold,
		onWriteFailure: raiseWriteFailure,
	})

	const routines = useMemo(() => toRoutineRows(held, titles), [held, titles])

	return useMemo(
		() => ({ routines, failure, reload, setEnabled, remove, form }),
		[routines, failure, reload, setEnabled, remove, form],
	)
}
