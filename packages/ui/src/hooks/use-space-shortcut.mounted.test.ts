// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useSpaceShortcut } from "@workspace/ui/hooks/use-space-shortcut"

type Shortcut = Parameters<typeof useSpaceShortcut>[0]

const chordOn = (onRank: Shortcut["onRank"], isEnabled = true): Shortcut => ({
	count: 5,
	isEnabled,
	onRank,
})

const press = (key: string) => {
	const event = new KeyboardEvent("keydown", {
		cancelable: true,
		key,
		metaKey: true,
	})
	window.dispatchEvent(event)
	return event
}

describe("useSpaceShortcut mounted", () => {
	afterEach(cleanup)

	it("reaches a rank once however many times the consumer has re-rendered", () => {
		const onRank = vi.fn()
		const view = renderHook(useSpaceShortcut, {
			initialProps: chordOn(vi.fn()),
		})
		for (let render = 0; render < 4; render += 1) {
			view.rerender(chordOn(vi.fn()))
		}
		view.rerender(chordOn(onRank))

		const event = press("3")

		expect(onRank).toHaveBeenCalledTimes(1)
		expect(onRank).toHaveBeenCalledWith(3)
		expect(event.defaultPrevented).toBe(true)
	})

	it("hears nothing and prevents nothing once switching is turned off", () => {
		const onRank = vi.fn()
		const view = renderHook(useSpaceShortcut, {
			initialProps: chordOn(onRank),
		})
		view.rerender(chordOn(onRank, false))

		const event = press("3")

		expect(onRank).not.toHaveBeenCalled()
		expect(event.defaultPrevented).toBe(false)
	})

	it("stops listening once unmounted", () => {
		const onRank = vi.fn()
		const view = renderHook(useSpaceShortcut, {
			initialProps: chordOn(onRank),
		})
		view.unmount()

		press("3")

		expect(onRank).not.toHaveBeenCalled()
	})
})
