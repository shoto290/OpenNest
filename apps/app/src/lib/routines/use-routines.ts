import { useCallback, useEffect, useMemo, useState } from "react"

import type { RoutineRowModel } from "@workspace/ui/components/routine-row"

import type { Routine } from "./routine-contract"
import {
	botIdsOf,
	type SourceTitles,
	toRoutineRows,
	toSourceTitles,
} from "./routines-model"
import { routinesTransport } from "./routines-transport"
import { triggerSourcesTransport } from "./trigger-sources-transport"

const NO_ROUTINES: Routine[] = []
const NO_TITLES: SourceTitles = new Map()

export type ConversationRoutines = {
	routines: RoutineRowModel[]
	hasFailed: boolean
	reload: () => void
	setEnabled: (id: string, isEnabled: boolean) => void
	remove: (id: string) => Promise<void>
}

const titlesOf = async (routines: Routine[]): Promise<SourceTitles> =>
	toSourceTitles(
		await Promise.all(
			botIdsOf(routines).map(async (botId) => ({
				botId,
				sources: await triggerSourcesTransport.sources(botId),
			})),
		),
	)

export const useRoutines = (conversationId: string): ConversationRoutines => {
	const [held, setHeld] = useState<Routine[]>(NO_ROUTINES)
	const [titles, setTitles] = useState<SourceTitles>(NO_TITLES)
	const [hasFailed, setFailed] = useState(false)

	const noteFailure = useCallback(() => setFailed(true), [])

	const reload = useCallback(() => {
		void routinesTransport
			.list(conversationId)
			.then(async (listed) => {
				setTitles(await titlesOf(listed))
				setHeld(listed)
				setFailed(false)
			})
			.catch(noteFailure)
	}, [conversationId, noteFailure])

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
				.then((written) => {
					setHeld((rows) =>
						rows.map((row) => (row.id === written.id ? written : row)),
					)
				}, noteFailure)
		},
		[held, noteFailure],
	)

	const remove = useCallback(
		(id: string) =>
			routinesTransport.delete(id).then(
				() => {
					setHeld((rows) => rows.filter((row) => row.id !== id))
				},
				(failure: unknown) => {
					noteFailure()
					throw failure
				},
			),
		[noteFailure],
	)

	const routines = useMemo(() => toRoutineRows(held, titles), [held, titles])

	return useMemo(
		() => ({ routines, hasFailed, reload, setEnabled, remove }),
		[routines, hasFailed, reload, setEnabled, remove],
	)
}
