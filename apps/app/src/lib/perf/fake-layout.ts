const VIEWPORT_WIDTH = 800

const VIEWPORT_HEIGHT = 600

const ROW_HEIGHT = 120

const VIEWPORT_SELECTOR = '[data-slot="message-scroller"] > section'

const ROW_SELECTOR = '[data-slot="message-scroller-row"]'

export type FakeLayout = { restore: () => void }

const heightOf = (element: Element) => {
	if (element.matches(ROW_SELECTOR)) return ROW_HEIGHT
	if (element.matches(VIEWPORT_SELECTOR)) return VIEWPORT_HEIGHT
	return 0
}

const rectOf = (height: number): DOMRect => ({
	bottom: height,
	height,
	left: 0,
	right: VIEWPORT_WIDTH,
	top: 0,
	width: VIEWPORT_WIDTH,
	x: 0,
	y: 0,
	toJSON: () => ({}),
})

const sizeDescriptor = (read: (element: HTMLElement) => number) => ({
	configurable: true,
	get(this: HTMLElement) {
		return read(this)
	},
})

export const fakeLayout = (): FakeLayout => {
	const measured = Element.prototype.getBoundingClientRect
	const offsets = {
		offsetHeight: Object.getOwnPropertyDescriptor(
			HTMLElement.prototype,
			"offsetHeight",
		),
		offsetWidth: Object.getOwnPropertyDescriptor(
			HTMLElement.prototype,
			"offsetWidth",
		),
	}

	Element.prototype.getBoundingClientRect = function patched(this: Element) {
		const height = heightOf(this)
		return height === 0 ? measured.call(this) : rectOf(height)
	}
	Object.defineProperty(
		HTMLElement.prototype,
		"offsetHeight",
		sizeDescriptor(heightOf),
	)
	Object.defineProperty(
		HTMLElement.prototype,
		"offsetWidth",
		sizeDescriptor(() => VIEWPORT_WIDTH),
	)

	return {
		restore: () => {
			Element.prototype.getBoundingClientRect = measured
			for (const [name, descriptor] of Object.entries(offsets)) {
				if (descriptor) {
					Object.defineProperty(HTMLElement.prototype, name, descriptor)
				}
			}
		},
	}
}
