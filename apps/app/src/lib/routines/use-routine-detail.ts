import { useCallback, useMemo, useRef, useState } from "react"

import type {
	RoutineRunModel,
	RoutineRunRefusal,
} from "@workspace/ui/components/routine-detail"
import type { RoutineRowModel } from "@workspace/ui/components/routine-row"
import type { RoutinesPanelDetail } from "@workspace/ui/components/routines-panel"

import { toRunModels } from "./routines-model"
import { DEFAULT_RUN_PAGE, routinesTransport } from "./routines-transport"

type RunsRead = {
	runs: RoutineRunModel[]
	readAt: number
	hasReadFullPage: boolean
}

type OpenRoutine = {
	routineId: string
	read: RunsRead | null
	isReading: boolean
	hasFailedToReadRuns: boolean
	isRunning: boolean
	refusal: RoutineRunRefusal | null
}

const opening = (routineId: string): OpenRoutine => ({
	routineId,
	read: null,
	isReading: true,
	hasFailedToReadRuns: false,
	isRunning: false,
	refusal: null,
})

export type RoutineDetailWiring = {
	routines: RoutineRowModel[]
	onWriteFailure: () => void
}

export const useRoutineDetail = ({
	routines,
	onWriteFailure,
}: RoutineDetailWiring): RoutinesPanelDetail => {
	const [held, setHeld] = useState<OpenRoutine | null>(null)
	const placed = useRef(0)

	const revise = useCallback(
		(placement: number, change: (held: OpenRoutine) => OpenRoutine) =>
			setHeld((current) =>
				current && placement === placed.current ? change(current) : current,
			),
		[],
	)

	const readRuns = useCallback(
		(routineId: string) => {
			const placement = placed.current
			revise(placement, (current) => ({ ...current, isReading: true }))

			void routinesTransport.runs(routineId).then(
				(carried) =>
					revise(placement, (current) => ({
						...current,
						isReading: false,
						hasFailedToReadRuns: false,
						read: {
							runs: toRunModels(carried),
							readAt: Date.now(),
							hasReadFullPage: carried.length >= DEFAULT_RUN_PAGE,
						},
					})),
				() =>
					revise(placement, (current) => ({
						...current,
						isReading: false,
						hasFailedToReadRuns: true,
					})),
			)
		},
		[revise],
	)

	const onOpen = useCallback(
		(routineId: string) => {
			placed.current += 1
			setHeld(opening(routineId))
			readRuns(routineId)
		},
		[readRuns],
	)

	const onClose = useCallback(() => {
		placed.current += 1
		setHeld(null)
	}, [])

	const onRetryRuns = useCallback(() => {
		if (held) {
			readRuns(held.routineId)
		}
	}, [held, readRuns])

	const onRunNow = useCallback(() => {
		if (!held || held.isRunning) {
			return
		}

		const placement = placed.current
		const { routineId } = held
		revise(placement, (current) => ({
			...current,
			isRunning: true,
			refusal: null,
		}))

		void routinesTransport.runNow(routineId).then(
			(decision) => {
				revise(placement, (current) => ({
					...current,
					isRunning: false,
					refusal: decision.kind === "refused" ? decision.by : null,
				}))
				if (decision.kind !== "refused") {
					readRuns(routineId)
				}
			},
			() => {
				revise(placement, (current) => ({ ...current, isRunning: false }))
				onWriteFailure()
			},
		)
	}, [held, revise, readRuns, onWriteFailure])

	const open = useMemo(() => {
		const row = routines.find(({ id }) => id === held?.routineId)
		if (!held || !row) {
			return null
		}

		return {
			id: row.id,
			title: row.title,
			triggerSourceTitle: row.triggerSourceTitle,
			hasStoppedItself: row.hasStoppedItself,
			runs: held.read?.runs ?? [],
			isReadingRuns: held.isReading && held.read === null,
			hasFailedToReadRuns: held.hasFailedToReadRuns,
			hasReadFullPage: held.read?.hasReadFullPage ?? false,
			isRunning: held.isRunning,
			refusal: held.refusal ?? undefined,
			now: held.read?.readAt ?? 0,
		}
	}, [routines, held])

	return useMemo(
		() => ({ open, onOpen, onClose, onRetryRuns, onRunNow }),
		[open, onOpen, onClose, onRetryRuns, onRunNow],
	)
}
