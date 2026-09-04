import { useCallback, useEffect, useMemo, useState } from "react"

import type { RoutineTriggerSource } from "@workspace/ui/components/routine-form"
import type { RoutineRowModel } from "@workspace/ui/components/routine-row"
import type {
	RoutinesFailure,
	RoutinesPanelDetail,
	RoutinesPanelForm,
} from "@workspace/ui/components/routines-panel"

import type { Routine } from "./routine-contract"
import {
	botIdsOf,
	type KnownSources,
	toKnownSources,
	toRoutineRows,
	toTriggerSources,
} from "./routines-model"
import { routinesTransport } from "./routines-transport"
import type { TriggerSource } from "./trigger-contract"
import { triggerSourcesTransport } from "./trigger-sources-transport"
import { useRoutineDetail } from "./use-routine-detail"
import { useRoutineForm } from "./use-routine-form"

const withoutWriteFailure = (current: RoutinesFailure | null) =>
	current === "write" ? null : current

const NO_ROUTINES: Routine[] = []
const NO_KNOWN_SOURCES: KnownSources = new Map()
const NO_SOURCES: RoutineTriggerSource[] = []

export type ConversationRoutines = {
	routines: RoutineRowModel[]
	failure: RoutinesFailure | null
	reload: () => void
	setEnabled: (id: string, isEnabled: boolean) => void
	remove: (id: string) => Promise<void>
	form: RoutinesPanelForm
	detail: RoutinesPanelDetail
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

const leadDeclaration = (
	leadBotId: string | undefined,
	declared: TriggerSource[] | null,
): Declaration | null =>
	leadBotId && declared ? { botId: leadBotId, sources: declared } : null

const knownOf = async (
	listed: Routine[],
	lead: Declaration | null,
): Promise<KnownSources> => {
	const others = await declaredBy(
		botIdsOf(listed).filter((botId) => botId !== lead?.botId),
	)

	return toKnownSources(lead ? [lead, ...others] : others)
}

export const useRoutines = (
	conversationId: string | null,
	leadBotId?: string,
): ConversationRoutines => {
	const [held, setHeld] = useState<Routine[]>(NO_ROUTINES)
	const [known, setKnown] = useState<KnownSources>(NO_KNOWN_SOURCES)
	const [sources, setSources] = useState<RoutineTriggerSource[]>(NO_SOURCES)
	const [failure, setFailure] = useState<RoutinesFailure | null>(null)

	const reload = useCallback(() => {
		if (!conversationId) {
			return
		}

		void Promise.allSettled([
			routinesTransport.list(conversationId),
			declaredByLead(leadBotId),
		]).then(async ([listing, declaring]) => {
			const declared = declaring.status === "fulfilled" ? declaring.value : null
			setSources(declared ? toTriggerSources(declared) : NO_SOURCES)

			if (listing.status === "rejected") {
				setFailure("read")
				return
			}

			setKnown(
				await knownOf(listing.value, leadDeclaration(leadBotId, declared)),
			)
			setHeld(listing.value)
			setFailure(declared ? null : "read")
		})
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

	const routines = useMemo(() => toRoutineRows(held, known), [held, known])

	const detail = useRoutineDetail({
		routines,
		onWriteFailure: raiseWriteFailure,
	})

	const form = useRoutineForm({
		conversationId,
		isOverDetail: detail.open !== null,
		leadBotId,
		sources,
		known,
		held,
		onWritten: hold,
		onWriteFailure: raiseWriteFailure,
	})

	return useMemo(
		() => ({ routines, failure, reload, setEnabled, remove, form, detail }),
		[routines, failure, reload, setEnabled, remove, form, detail],
	)
}
