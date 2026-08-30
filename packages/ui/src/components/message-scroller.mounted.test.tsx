// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
	MessageScroller,
	type MessageScrollerRow,
} from "@workspace/ui/components/message-scroller"

import "@workspace/ui/lib/i18n"

const VIEWPORT_HEIGHT = 300
const ROW_HEIGHT = 80

const rowsUpTo = (count: number): MessageScrollerRow[] =>
	Array.from({ length: count }, (_, index) => ({
		key: `row-${index}`,
		messageIds: [`row-${index}`],
		render: () => `Row ${index}`,
	}))

const stubLayout = (viewport: HTMLElement, contentHeight: () => number) => {
	let scrollTop = 0
	Object.defineProperty(viewport, "clientHeight", {
		configurable: true,
		get: () => VIEWPORT_HEIGHT,
	})
	Object.defineProperty(viewport, "scrollHeight", {
		configurable: true,
		get: contentHeight,
	})
	Object.defineProperty(viewport, "scrollTop", {
		configurable: true,
		get: () => scrollTop,
		set: (next: number) => {
			scrollTop = Math.max(
				0,
				Math.min(next, viewport.scrollHeight - VIEWPORT_HEIGHT),
			)
		},
	})
}

const renderScroller = (count: number) => {
	let mountedRows = count
	const scroller = (rowCount: number) => (
		<MessageScroller
			smooth={false}
			estimatedRowHeight={ROW_HEIGHT}
			rows={rowsUpTo(rowCount)}
		/>
	)

	const view = render(scroller(0))
	const viewport = view.container.querySelector<HTMLElement>("section")
	if (!viewport) throw new Error("viewport never mounted")

	stubLayout(viewport, () => mountedRows * ROW_HEIGHT)
	const endOf = () => viewport.scrollHeight - VIEWPORT_HEIGHT
	const grow = (nextCount: number) =>
		act(() => {
			mountedRows = nextCount
			view.rerender(scroller(nextCount))
		})

	grow(count)
	return { viewport, endOf, grow }
}

describe("MessageScroller mounted", () => {
	afterEach(cleanup)

	it("holds the end when rows are added under a reader at the last message", () => {
		const { viewport, endOf, grow } = renderScroller(10)
		expect(viewport.scrollTop).toBe(endOf())

		grow(13)

		expect(viewport.scrollTop).toBe(endOf())
	})

	it("leaves the reading position still when rows are added under a reader up in the history", () => {
		const { viewport, grow } = renderScroller(10)
		viewport.scrollTop = 0
		fireEvent.scroll(viewport)

		grow(13)

		expect(viewport.scrollTop).toBe(0)
	})
})
