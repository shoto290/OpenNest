// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"

import { useBubbleVisibility } from "./use-bubble-visibility"

const BUBBLE = "m-1#0"

const mountTranscript = () => {
	const transcript = document.createElement("div")
	transcript.setAttribute("data-slot", "message-scroller")
	document.body.append(transcript)
	return transcript
}

const mountAnchor = (transcript: Element) => {
	const anchor = document.createElement("div")
	anchor.setAttribute("data-message-id", BUBBLE)
	transcript.append(anchor)
	return anchor
}

afterEach(() => {
	cleanup()
	document.body.replaceChildren()
})

it("reports a bubble the scroller has unmounted as out of view", async () => {
	const anchor = mountAnchor(mountTranscript())
	const { result } = renderHook(() => useBubbleVisibility(BUBBLE))

	expect(result.current).toBe(true)

	await act(async () => {
		anchor.remove()
	})

	expect(result.current).toBe(false)
})

it("reports a bubble that was never mounted as out of view", async () => {
	mountTranscript()
	const { result } = renderHook(() => useBubbleVisibility(BUBBLE))

	await act(async () => {
		await Promise.resolve()
	})

	expect(result.current).toBe(false)
})
