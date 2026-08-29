// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useOverlayScroll } from "@workspace/ui/hooks/use-overlay-scroll"

const Panel = () => {
	const overlayScroll = useOverlayScroll()

	return (
		<div data-slot="panel" ref={overlayScroll}>
			<p data-slot="content" />
		</div>
	)
}

const renderPanel = () => {
	const { container } = render(<Panel />)
	const panel = container.querySelector<HTMLElement>('[data-slot="panel"]')
	if (!panel) throw new Error("panel never mounted")
	return panel
}

describe("useOverlayScroll mounted", () => {
	afterEach(cleanup)

	it("hangs a thumb inside the element the ref points at", () => {
		const panel = renderPanel()

		expect(panel.querySelectorAll(".os-scrollbar-handle").length).toBe(2)
		expect(panel.clientWidth).toBe(panel.offsetWidth)
	})

	it("leaves the element itself the one that scrolls its own children", () => {
		const panel = renderPanel()

		expect(panel.hasAttribute("data-overlayscrollbars-viewport")).toBe(true)
		expect(panel.firstElementChild?.getAttribute("data-slot")).toBe("content")
	})
})
