import { useCallback, useEffect, useRef, useState } from "react"

import { usePrefersReducedMotion } from "@workspace/ui/hooks/use-prefers-reduced-motion"

const CHARACTERS_PER_SECOND = 30

const typingMs = (text: string) => (text.length / CHARACTERS_PER_SECOND) * 1000

const FIRST_ANSWER_AT = 2400
const SECOND_ANSWER_AT = 6000
const MISSION_DELAY = 1000
const IDLE_MS = 8000

const FROZEN_STATE_PARAMETER = "state"

type SceneAnswers = readonly [string, string]

const missionAtOf = (answers: SceneAnswers) =>
	SECOND_ANSWER_AT + typingMs(answers[1]) + MISSION_DELAY

const beatElapsed = (answers: SceneAnswers) => [
	0,
	FIRST_ANSWER_AT + typingMs(answers[0]) / 2,
	SECOND_ANSWER_AT + typingMs(answers[1]) / 2,
	SECOND_ANSWER_AT + typingMs(answers[1]),
	missionAtOf(answers),
]

const typedCount = (text: string, sinceMs: number) =>
	Math.min(text.length, Math.floor((sinceMs * CHARACTERS_PER_SECOND) / 1000))

type SceneFrame = {
	elapsedSeconds: number
	firstTyped: number
	secondTyped: number
	hasFirstAnswer: boolean
	hasSecondAnswer: boolean
	hasMission: boolean
}

const frameAt = (elapsed: number, answers: SceneAnswers): SceneFrame => {
	const hasFirstAnswer = elapsed >= FIRST_ANSWER_AT
	const hasSecondAnswer = elapsed >= SECOND_ANSWER_AT

	return {
		elapsedSeconds: Math.floor(elapsed / 1000),
		firstTyped: hasFirstAnswer
			? typedCount(answers[0], elapsed - FIRST_ANSWER_AT)
			: 0,
		secondTyped: hasSecondAnswer
			? typedCount(answers[1], elapsed - SECOND_ANSWER_AT)
			: 0,
		hasFirstAnswer,
		hasSecondAnswer,
		hasMission: elapsed >= missionAtOf(answers),
	}
}

const isSameFrame = (one: SceneFrame, other: SceneFrame) =>
	one.elapsedSeconds === other.elapsedSeconds &&
	one.firstTyped === other.firstTyped &&
	one.secondTyped === other.secondTyped &&
	one.hasFirstAnswer === other.hasFirstAnswer &&
	one.hasSecondAnswer === other.hasSecondAnswer &&
	one.hasMission === other.hasMission

type StillElapsedInput = {
	answers: SceneAnswers
	beat: number | null
	prefersReducedMotion: boolean
}

const stillElapsed = ({
	answers,
	beat,
	prefersReducedMotion,
}: StillElapsedInput) => {
	if (beat !== null) return beatElapsed(answers)[beat - 1]
	return prefersReducedMotion ? missionAtOf(answers) : null
}

const frozenBeat = () => {
	const asked = new URLSearchParams(window.location.search).get(
		FROZEN_STATE_PARAMETER,
	)
	if (asked === null) return null

	const rank = Number.parseInt(asked, 10)
	return rank >= 1 && rank <= 5 ? rank : null
}

type SceneTimeline = {
	frame: SceneFrame
	engage: () => void
	cancelIdle: () => void
}

type SceneTimelineState = {
	frame: SceneFrame
	runId: string | null
}

const timelineAt = (
	answers: SceneAnswers,
	stillAt: number | null,
	runId: string | null,
): SceneTimelineState => ({
	frame: frameAt(stillAt ?? 0, answers),
	runId,
})

type SceneTimelineInput = {
	answers: SceneAnswers
	onIdle: () => void
	runId: string | null
}

export const useSceneTimeline = ({
	answers,
	onIdle,
	runId,
}: SceneTimelineInput): SceneTimeline => {
	const prefersReducedMotion = usePrefersReducedMotion()
	const [beat] = useState(frozenBeat)
	const idleRef = useRef<number | undefined>(undefined)
	const onIdleRef = useRef(onIdle)
	const stillAt = stillElapsed({ answers, beat, prefersReducedMotion })
	const [timeline, setTimeline] = useState<SceneTimelineState>(() =>
		timelineAt(answers, stillAt, runId),
	)

	if (timeline.runId !== runId) setTimeline(timelineAt(answers, stillAt, runId))

	onIdleRef.current = onIdle

	const engage = useCallback(() => {
		window.clearTimeout(idleRef.current)
		idleRef.current = window.setTimeout(() => {
			onIdleRef.current()
		}, IDLE_MS)
	}, [])

	const cancelIdle = useCallback(() => {
		window.clearTimeout(idleRef.current)
	}, [])

	useEffect(() => () => window.clearTimeout(idleRef.current), [])

	useEffect(() => {
		if (runId === null) return

		if (stillAt !== null) {
			setTimeline(timelineAt(answers, stillAt, runId))
			return
		}

		const missionAt = missionAtOf(answers)
		let elapsed = 0
		let lastFrameAt = performance.now()
		let request = 0

		const advance = (now: number) => {
			elapsed = Math.min(elapsed + (now - lastFrameAt), missionAt)
			lastFrameAt = now

			const frame = frameAt(elapsed, answers)
			setTimeline((current) =>
				isSameFrame(current.frame, frame) ? current : { frame, runId },
			)

			request = elapsed < missionAt ? requestAnimationFrame(advance) : 0
		}

		const stop = () => {
			cancelAnimationFrame(request)
			request = 0
		}

		const resume = () => {
			lastFrameAt = performance.now()
			request = requestAnimationFrame(advance)
		}

		const onVisibilityChange = () => {
			if (document.hidden) stop()
			else if (request === 0 && elapsed < missionAt) resume()
		}

		resume()
		document.addEventListener("visibilitychange", onVisibilityChange)

		return () => {
			stop()
			document.removeEventListener("visibilitychange", onVisibilityChange)
		}
	}, [answers, runId, stillAt])

	return { frame: timeline.frame, engage, cancelIdle }
}

export type { SceneAnswers, SceneFrame }
