import { useCallback, useEffect, useMemo, useState } from "react"

import type { RoutineRowModel } from "@workspace/ui/components/routine-row"
import type { RoutinesFailure } from "@workspace/ui/components/routines-panel"

import type { Routine } from "./routine-contract"
import {
	botIdsOf,
	type SourceTitles,
	toRoutineRows,
	toSourceTitles,
} from "./routines-model"
import { routinesTransport } from "./routines-transport"
import { triggerSourcesTransport } from "./trigger-sources-transport"

const withoutWriteFailure = (current: RoutinesFailure | null) =>
	current === "write" ? null : current

const NO_ROUTINES: Routine[] = []
const NO_TITLES: SourceTitles = new Map()

export type ConversationRoutines = {
	routines: RoutineRowModel[]
	failure: RoutinesFailure | null
	reload: () => void
	setEnabled: (id: string, isEnabled: boolean) => void
	remove: (id: string) => Promise<void>
}

const titlesOf = async (routines: Routine[]): Promise<SourceTitles> => {
	const reads = await Promise.allSettled(
		botIdsOf(routines).map(async (botId) => ({
			botId,
			sources: await triggerSourcesTransport.sources(botId),
		})),
	)

	return toSourceTitles(
		reads.flatMap((read) => (read.status === "fulfilled" ? [read.value] : [])),
	)
}

export const useRoutines = (conversationId: string): ConversationRoutines => {
	const [held, setHeld] = useState<Routine[]>(NO_ROUTINES)
	const [titles, setTitles] = useState<SourceTitles>(NO_TITLES)
	const [failure, setFailure] = useState<RoutinesFailure | null>(null)

	const reload = useCallback(() => {
		void routinesTransport.list(conversationId).then(
			async (listed) => {
				setTitles(await titlesOf(listed))
				setHeld(listed)
				setFailure(null)
			},
			() => setFailure("read"),
		)
	}, [conversationId])

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

	const routines = useMemo(() => toRoutineRows(held, titles), [held, titles])

	return useMemo(
		() => ({ routines, failure, reload, setEnabled, remove }),
		[routines, failure, reload, setEnabled, remove],
	)
}
