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

export type RoutineDetailWiring = {
	routines: RoutineRowModel[]
	onWriteFailure: () => void
}

export const useRoutineDetail = ({
	routines,
	onWriteFailure,
}: RoutineDetailWiring): RoutinesPanelDetail => {
	const [openId, setOpenId] = useState<string | null>(null)
	const [read, setRead] = useState<RunsRead | null>(null)
	const [isReading, setReading] = useState(false)
	const [hasFailedToReadRuns, setFailedToRead] = useState(false)
	const [isRunning, setRunning] = useState(false)
	const [refusal, setRefusal] = useState<RoutineRunRefusal | null>(null)
	const placed = useRef(0)

	const readRuns = useCallback((routineId: string) => {
		const placement = placed.current
		setReading(true)
		setFailedToRead(false)

		void routinesTransport.runs(routineId).then(
			(carried) => {
				if (placement !== placed.current) {
					return
				}
				setRead({
					runs: toRunModels(carried),
					readAt: Date.now(),
					hasReadFullPage: carried.length >= DEFAULT_RUN_PAGE,
				})
				setReading(false)
			},
			() => {
				if (placement !== placed.current) {
					return
				}
				setFailedToRead(true)
				setReading(false)
			},
		)
	}, [])

	const place = useCallback((routineId: string | null) => {
		placed.current += 1
		setOpenId(routineId)
		setRead(null)
		setReading(false)
		setFailedToRead(false)
		setRunning(false)
		setRefusal(null)
	}, [])

	const onOpen = useCallback(
		(routineId: string) => {
			place(routineId)
			readRuns(routineId)
		},
		[place, readRuns],
	)

	const onClose = useCallback(() => place(null), [place])

	const onRetryRuns = useCallback(() => {
		if (openId) {
			readRuns(openId)
		}
	}, [openId, readRuns])

	const onRunNow = useCallback(() => {
		if (!openId || isRunning) {
			return
		}

		const placement = placed.current
		setRunning(true)
		setRefusal(null)

		void routinesTransport
			.runNow(openId)
			.then(
				(decision) => {
					if (placement !== placed.current) {
						return
					}
					if (decision.kind === "refused") {
						setRefusal(decision.by)
						return
					}
					readRuns(openId)
				},
				() => onWriteFailure(),
			)
			.finally(() => {
				if (placement === placed.current) {
					setRunning(false)
				}
			})
	}, [openId, isRunning, readRuns, onWriteFailure])

	const open = useMemo(() => {
		const row = routines.find(({ id }) => id === openId)
		if (!row) {
			return null
		}

		return {
			id: row.id,
			title: row.title,
			triggerSourceTitle: row.triggerSourceTitle,
			hasStoppedItself: row.hasStoppedItself,
			runs: read?.runs ?? [],
			isReadingRuns: isReading && read === null,
			hasFailedToReadRuns,
			hasReadFullPage: read?.hasReadFullPage ?? false,
			isRunning,
			refusal: refusal ?? undefined,
			now: read?.readAt ?? 0,
		}
	}, [
		routines,
		openId,
		read,
		isReading,
		hasFailedToReadRuns,
		isRunning,
		refusal,
	])

	return useMemo(
		() => ({ open, onOpen, onClose, onRetryRuns, onRunNow }),
		[open, onOpen, onClose, onRetryRuns, onRunNow],
	)
}
