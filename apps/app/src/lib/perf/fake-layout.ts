const VIEWPORT_WIDTH = 800

const VIEWPORT_HEIGHT = 600

export type MeasuredRowShape = { length: number; height: number }

const ONE_LINE_REPLY = "Queued behind the index build."

const USER_MESSAGE =
	"Can you walk me through what the migration script touches?"

const CODE_ANSWER = [
	"```ts",
	"export const migrate = async (db: Database) => {",
	'  await db.addColumn("accounts", "region", "text")',
	'  await db.copyColumn("memberships", "role", "role_id")',
	'  await db.dropColumn("memberships", "role")',
	"}",
	"```",
].join("\n")

const MARKDOWN_ANSWER = [
	"It rewrites three tables: accounts, memberships and invites. Accounts gains a nullable region column, memberships loses the legacy role string, and invites moves its expiry to a timestamptz.",
	"The legacy role string is copied into role_id before the column is dropped, so the drop is the last statement of the transaction and a failure halfway rolls every statement back.",
	"The down migration recreates the role string from role_id, which is lossless for every row the up migration wrote, so the rollback path stays open once it has shipped.",
].join("\n\n")

export const MEASURED_ROW_CONTENTS = [
	ONE_LINE_REPLY,
	USER_MESSAGE,
	CODE_ANSWER,
	MARKDOWN_ANSWER,
]

export const MEASURED_ROW_SHAPES: MeasuredRowShape[] = [
	{ length: 30, height: 44 },
	{ length: 58, height: 44 },
	{ length: 202, height: 185 },
	{ length: 537, height: 252 },
]

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

export const rowHeightFor = (length: number) => {
	if (length <= SHORTEST_SHAPE.length) return SHORTEST_SHAPE.height
	if (length >= LONGEST_SHAPE.length) return LONGEST_SHAPE.height

	const above = MEASURED_ROW_SHAPES.findIndex((shape) => shape.length >= length)
	return Math.round(
		between(length, MEASURED_ROW_SHAPES[above - 1], MEASURED_ROW_SHAPES[above]),
	)
}

const heightOf = (element: Element) => {
	if (element.matches(ROW_SELECTOR)) {
		return rowHeightFor((element.textContent ?? "").length)
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
