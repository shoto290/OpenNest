// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
	AnimatedSidebar,
	AnimatedSidebarProvider,
	SIDEBAR_MAX_WIDTH,
} from "@workspace/ui/components/motion/animated-sidebar"

import "@workspace/ui/lib/i18n"

const START_X = 400
const START_WIDTH = 300

const renderSidebar = (onWidthChange: (width: number) => void) => {
	render(
		<AnimatedSidebarProvider
			defaultWidth={START_WIDTH}
			onWidthChange={onWidthChange}
		>
			<AnimatedSidebar />
		</AnimatedSidebarProvider>,
	)

	return screen.getByRole("separator")
}

const grab = (handle: HTMLElement) => {
	fireEvent.pointerDown(handle, { button: 0, clientX: START_X })
}

const dispatch = (type: string, clientX?: number) => {
	act(() => {
		window.dispatchEvent(new PointerEvent(type, { clientX }))
	})
}

const moveTo = (clientX: number) => dispatch("pointermove", clientX)

const releaseAt = (clientX: number) => dispatch("pointerup", clientX)

const cancel = () => dispatch("pointercancel")

describe("AnimatedSidebar resize handle mounted", () => {
	afterEach(cleanup)

	it("commits the nearest whole pixel when the release carries a fraction", () => {
		const onWidthChange = vi.fn()
		const handle = renderSidebar(onWidthChange)

		grab(handle)
		moveTo(START_X + 50.4)
		releaseAt(START_X + 50.4)

		expect(onWidthChange).toHaveBeenCalledExactlyOnceWith(START_WIDTH + 50)
		expect(handle.getAttribute("aria-valuenow")).toBe(String(START_WIDTH + 50))
	})

	it("follows the pointer in whole pixels while the reader drags", () => {
		const handle = renderSidebar(vi.fn())

		grab(handle)
		moveTo(START_X + 20.6)

		expect(handle.getAttribute("aria-valuenow")).toBe(String(START_WIDTH + 21))
	})

	it("commits the last width the panel followed when the stream is cancelled", () => {
		const onWidthChange = vi.fn()
		const handle = renderSidebar(onWidthChange)

		grab(handle)
		moveTo(START_X + 60.5)
		cancel()

		expect(onWidthChange).toHaveBeenCalledExactlyOnceWith(START_WIDTH + 61)
	})

	it("commits nothing when the reader presses without dragging", () => {
		const onWidthChange = vi.fn()
		const handle = renderSidebar(onWidthChange)

		grab(handle)
		releaseAt(START_X)

		expect(onWidthChange).not.toHaveBeenCalled()
	})

	it("keeps a release beyond the maximum at the widest whole pixel", () => {
		const onWidthChange = vi.fn()
		const handle = renderSidebar(onWidthChange)

		grab(handle)
		moveTo(START_X + 900.7)
		releaseAt(START_X + 900.7)

		expect(onWidthChange).toHaveBeenCalledExactlyOnceWith(SIDEBAR_MAX_WIDTH)
	})

	it("mounts no handle when the host forbids resizing", () => {
		render(
			<AnimatedSidebarProvider defaultWidth={START_WIDTH} isResizable={false}>
				<AnimatedSidebar />
			</AnimatedSidebarProvider>,
		)

		expect(screen.queryByRole("separator")).toBeNull()
	})
})
