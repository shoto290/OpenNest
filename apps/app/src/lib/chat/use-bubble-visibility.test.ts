// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"

import { useBubbleVisibility } from "./use-bubble-visibility"

const BUBBLE = "m-1#0"

const mountAnchor = () => {
	const anchor = document.createElement("div")
	anchor.setAttribute("data-message-id", BUBBLE)
	document.body.append(anchor)
	return anchor
}

afterEach(() => {
	cleanup()
	document.body.replaceChildren()
})

it("reports a bubble the scroller has unmounted as out of view", async () => {
	const anchor = mountAnchor()
	const { result } = renderHook(() => useBubbleVisibility(BUBBLE))

	expect(result.current).toBe(true)

	await act(async () => {
		anchor.remove()
	})

	expect(result.current).toBe(false)
})

it("reports a bubble that was never mounted as out of view", async () => {
	const { result } = renderHook(() => useBubbleVisibility(BUBBLE))

	await act(async () => {
		await Promise.resolve()
	})

	expect(result.current).toBe(false)
})
