import { useId, useState } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Button } from "@workspace/ui/components/button"
import { SharedMark } from "@workspace/ui/components/motion/shared-mark"

/** `size-10`, read back by the stories that measure the box. */
const MARK_SIZE = 40

const Mark = () => <span className="size-10 rounded-full bg-primary" />

/** The two homes are mutually exclusive, so exactly one holds the id at a time
 * and Motion moves the survivor instead of blinking between them. */
const Journey = () => {
	const markId = useId()
	const [arrived, setArrived] = useState(false)

	return (
		<div className="flex max-w-md flex-col gap-6">
			<Button
				size="sm"
				variant="outline"
				className="self-start"
				onClick={() => setArrived(!arrived)}
			>
				{arrived ? "Send it back" : "Send it across"}
			</Button>
			<div data-testid="origin" className="flex items-center gap-2 text-sm">
				{arrived ? null : (
					<SharedMark markId={markId}>
						<Mark />
					</SharedMark>
				)}
				Origin
			</div>
			<div data-testid="destination" className="text-sm leading-6">
				{arrived ? (
					<SharedMark markId={markId}>
						<Mark />
					</SharedMark>
				) : null}
				Destination
			</div>
		</div>
	)
}

const meta = preview.meta({
	title: "Primitives/SharedMark",
	component: SharedMark,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The box a travelling mark occupies. Give the same `markId` to two places a mark can live and Motion moves it between them rather than letting it disappear from one and reappear in the other. Two rules make that work, and both are load-bearing: exactly one node may hold a given id at a time — the places must be mutually exclusive, never two rows of one list — and the box measures the same wherever it lands, which is why it is a block box rather than an inline one. Without an id it is a plain span with nothing to travel to, and pays nothing for the possibility. `AI/ChatTurn → Mark` shows it carrying the bot's avatar across a real transcript.",
			},
		},
	},
})

export const Default = meta.story({
	render: () => <Journey />,
	parameters: {
		docs: {
			description: {
				story:
					"Send the mark across and back. Check that it never blinks — one node leaves, the other arrives, and the same box travels between them — and that with reduced motion it simply appears at the destination.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const held = () => canvasElement.querySelectorAll('[data-state="marked"]')

		await expect(held()).toHaveLength(1)

		await userEvent.click(
			canvas.getByRole("button", { name: "Send it across" }),
		)

		await expect(held()).toHaveLength(1)
	},
})

export const StableBox = meta.story({
	render: () => (
		<div className="flex max-w-md flex-col gap-6">
			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs">Flex parent</span>
				<div data-testid="flex-parent" className="flex w-fit bg-accent">
					<SharedMark>
						<Mark />
					</SharedMark>
				</div>
			</div>
			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs">Text parent</span>
				<div
					data-testid="text-parent"
					className="w-fit bg-accent text-sm leading-6"
				>
					<SharedMark>
						<Mark />
					</SharedMark>
				</div>
			</div>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same mark under two formatting contexts, each tinted so any slack shows. An inline box would sit on the second parent's text baseline and leave the line's descender under it, so a mark travelling between the two would land short of where it belongs by exactly that much. Check that neither parent is taller than the mark inside it.",
			},
		},
	},
	play: async ({ canvas }) => {
		const heightOf = (parent: string) =>
			canvas.getByTestId(parent).getBoundingClientRect().height

		await expect(heightOf("flex-parent")).toBe(MARK_SIZE)
		await expect(heightOf("text-parent")).toBe(MARK_SIZE)
	},
})

export const Plain = meta.story({
	render: () => (
		<SharedMark>
			<Mark />
		</SharedMark>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Without a `markId` the slot is a plain span: nothing to travel to, no layout animation, no projection node. Reach for this wherever a mark is drawn but is not the one currently travelling — the older rows of a transcript, for instance.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			canvasElement.querySelector('[data-slot="shared-mark"]'),
		).toHaveAttribute("data-state", "plain")
	},
})
