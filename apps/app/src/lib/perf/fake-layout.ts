const VIEWPORT_WIDTH = 800

const VIEWPORT_HEIGHT = 600

export type MeasuredRowShape = { length: number; height: number }

export const MEASURED_ROW_SHAPES: MeasuredRowShape[] = [
	{ length: 25, height: 234 },
	{ length: 30, height: 44 },
	{ length: 58, height: 44 },
	{ length: 212, height: 185 },
	{ length: 539, height: 252 },
]

const SHAPE_FILLER = " and more of the same answer"

const SHORTEST_SHAPE = MEASURED_ROW_SHAPES[0]

const LONGEST_SHAPE = MEASURED_ROW_SHAPES[MEASURED_ROW_SHAPES.length - 1]

const VIEWPORT_SELECTOR = '[data-slot="message-scroller"] > section'

const ROW_SELECTOR = '[data-slot="message-scroller-row"]'

export type FakeLayout = { restore: () => void }

const between = (
	length: number,
	low: MeasuredRowShape,
	high: MeasuredRowShape,
) =>
	low.height +
	((high.height - low.height) * (length - low.length)) /
		(high.length - low.length)

const rowHeightFor = (text: string) => {
	const { length } = text
	if (length <= SHORTEST_SHAPE.length) return SHORTEST_SHAPE.height
	if (length >= LONGEST_SHAPE.length) return LONGEST_SHAPE.height

	const above = MEASURED_ROW_SHAPES.findIndex((shape) => shape.length >= length)
	return Math.round(
		between(length, MEASURED_ROW_SHAPES[above - 1], MEASURED_ROW_SHAPES[above]),
	)
}

export const shapedContent = (text: string, index: number) => {
	const held = MEASURED_ROW_SHAPES.filter(
		(shape) => shape.length >= text.length,
	)
	return text.padEnd(held[index % held.length].length, SHAPE_FILLER)
}

const heightOf = (element: Element) => {
	if (element.matches(ROW_SELECTOR)) {
		return rowHeightFor(element.textContent ?? "")
	}
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
