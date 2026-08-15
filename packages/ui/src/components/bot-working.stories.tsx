import { expect, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { ANIMALS } from "@workspace/ui/components/bot-avatar-animals"
import {
	BotWorking,
	type BotWorkingKind,
} from "@workspace/ui/components/bot-working"

const BOT_WORKING_KINDS: BotWorkingKind[] = [
	"thinking",
	"searching",
	"working",
	"writing",
	"waiting",
]

const meta = preview.meta({
	title: "AI/BotWorking",
	component: BotWorking,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"What the transcript shows while the bot is busy: its avatar, alone, in the pose that matches the work. The words only appear while the reader points at the avatar — timed kinds add a clock to them, untimed ones only shimmer. The kind comes from the running tool, so reading turns the avatar to `searching` and a shell command to `working`. Nothing here polls the transport; a screen maps its own state onto `kind` and `label`.",
			},
		},
	},
	args: { kind: "thinking", name: "No name" },
	argTypes: {
		kind: { control: "select", options: BOT_WORKING_KINDS },
		animal: { control: "select", options: Object.keys(ANIMALS) },
		size: { control: { type: "range", min: 20, max: 64, step: 2 } },
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to audition a kind with its own label, as a tool would supply. Check that the avatar pose changes with the kind and that only `searching` and `working` add a running clock.",
			},
		},
	},
})

export const Variants = meta.story({
	render: () => (
		<div className="flex flex-col gap-4">
			{BOT_WORKING_KINDS.map((kind) => (
				<BotWorking key={kind} kind={kind} />
			))}
		</div>
	),
	play: async ({ canvas }) => {
		await expect(canvas.getByText("No name is thinking…")).not.toBeVisible()
	},
	parameters: {
		docs: {
			description: {
				story:
					"Every kind of work, in the order a turn tends to walk through them, at rest — which is how the transcript shows them. Check that each pose reads differently at avatar size without any words to lean on. Pick `HoverLabel` for what pointing at one says.",
			},
		},
	},
})

export const WithTool = meta.story({
	args: { kind: "working", label: "Bash · npm test" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when a tool is running: on hover the label names the step itself rather than a verb, and the clock says how long it has been going. Check that the elapsed time keeps counting behind the fade and that a long tool title does not push the row past the column.",
			},
		},
	},
})

export const HoverLabel = meta.story({
	args: { kind: "searching" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to check the hover affordance: the row is only an avatar until the reader points at it, and the words that fade in name who is busy and at what. Check that nothing shifts as they appear — the text holds its place while invisible, and screen readers get it either way.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const text = canvas.getByText("No name is searching…")

		await expect(text).not.toBeVisible()
		await userEvent.hover(canvas.getByRole("img"))
		// The reveal is a fade, so the row is only fully readable once it lands.
		await waitFor(() => expect(text).toBeVisible())
	},
})
