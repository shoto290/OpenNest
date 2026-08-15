import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { PromptInput } from "@workspace/ui/components/prompt-input"

const DRAFT = "Summarise the release notes for v0.1"

const LONG_DRAFT = [
	"Review the release branch and write the changelog for v0.1.",
	"",
	"Cover the desktop shell, the design foundations and the chat surface.",
	"Group the entries by package, newest first, and keep each line under",
	"twelve words so the notes stay scannable in the terminal.",
	"",
	"Flag anything that changes a public export, then list the follow-ups",
	"we deliberately left out of this milestone.",
].join("\n")

const meta = preview.meta({
	title: "AI/PromptInput",
	component: PromptInput,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The composer for a single agent turn: write a prompt, send it, stop the run. Enter sends, Shift+Enter breaks a line, and the trailing control is one button whose slot swaps between send and stop — `loading` decides which glyph, `onStop` decides whether it can be pressed.",
			},
		},
	},
	args: {
		onSubmit: fn(),
		onValueChange: fn(),
		onStop: fn(),
	},
	argTypes: {
		loading: { control: "boolean" },
		disabled: { control: "boolean" },
		placeholder: { control: "text" },
		minRows: { control: { type: "number", min: 1, max: 8 } },
		maxRows: { control: { type: "number", min: 2, max: 16 } },
	},
	decorators: [
		(Story) => (
			<div className="w-[34rem] max-w-full">
				<Story />
			</div>
		),
	],
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The knob story, and the keyboard contract in one pass: typing, Shift+Enter for a second line, Enter to send. Check that Shift+Enter never fires `onSubmit`, that Enter sends the trimmed value, and that an uncontrolled input clears itself afterwards. Flip `loading` here to watch the send glyph roll into the stop glyph in place.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const textarea = canvas.getByRole("textbox", { name: "Prompt" })

		await userEvent.click(textarea)
		await userEvent.type(textarea, "Draft the changelog")
		await userEvent.keyboard("{Shift>}{Enter}{/Shift}")
		await userEvent.type(textarea, "for v0.1")

		await expect(textarea).toHaveValue("Draft the changelog\nfor v0.1")
		await expect(args.onSubmit).not.toHaveBeenCalled()

		await userEvent.keyboard("{Enter}")

		await expect(args.onSubmit).toHaveBeenCalledWith(
			"Draft the changelog\nfor v0.1",
		)
		await expect(textarea).toHaveValue("")
	},
})

export const Default = meta.story({
	args: { defaultValue: DRAFT },
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: a draft is typed and the field holds focus, so this is the story to open when reviewing the focus ring and the enabled send button. Check that the ring reads on the whole composer rather than on the textarea alone, and that Enter sends without a click. `Empty` covers the state before anything is typed.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const textarea = canvas.getByRole("textbox", { name: "Prompt" })

		await userEvent.click(textarea)
		await expect(textarea).toHaveFocus()
		await expect(
			canvas.getByRole("button", { name: "Send prompt" }),
		).toBeEnabled()

		await userEvent.keyboard("{Enter}")

		await expect(args.onSubmit).toHaveBeenCalledWith(DRAFT)
		await expect(textarea).toHaveValue("")
	},
})

export const Empty = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Nothing typed yet — the resting state of a new turn. Check that the placeholder stays readable against the surface and that send is disabled, since a blank or whitespace-only prompt must never reach `onSubmit`. `Default` covers the same input once a draft exists.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("button", { name: "Send prompt" }),
		).toBeDisabled()
	},
})

export const States = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every state of the composer stacked, idle to loading. Reach for it when changing the border, ring or opacity tokens: the second instance is focused by the play function, so the focus ring can be compared against the resting border without touching the canvas. Check that disabled dims the whole composer and blocks the textarea, and that loading keeps the field editable while the trailing control shows stop.",
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-4">
			<PromptInput {...args} aria-label="Idle prompt" />
			<PromptInput {...args} defaultValue={DRAFT} aria-label="Focused prompt" />
			<PromptInput
				{...args}
				disabled
				defaultValue={DRAFT}
				aria-label="Disabled prompt"
			/>
			<PromptInput
				{...args}
				loading
				defaultValue={DRAFT}
				aria-label="Loading prompt"
			/>
		</div>
	),
	play: async ({ canvas, userEvent }) => {
		const focused = canvas.getByRole("textbox", { name: "Focused prompt" })

		await userEvent.click(focused)
		await expect(focused).toHaveFocus()
		await expect(
			canvas.getByRole("textbox", { name: "Disabled prompt" }),
		).toBeDisabled()
	},
})

export const LongContent = meta.story({
	args: { defaultValue: LONG_DRAFT, maxRows: 6 },
	parameters: {
		docs: {
			description: {
				story:
					"A multi-paragraph prompt longer than `maxRows`. Check that the field grows line by line up to the cap and then scrolls instead of pushing the send button off screen, and that the last line stays visible while typing. Lower `maxRows` in the Playground to reproduce the cap on a shorter prompt.",
			},
		},
	},
})

export const Loading = meta.story({
	args: { loading: true, defaultValue: DRAFT },
	parameters: {
		docs: {
			description: {
				story:
					"A turn is running: the same button now carries the stop glyph, and Enter is inert so a second turn cannot be queued. Check that only one control sits in the trailing slot through the swap, and that the field stays editable so the next prompt can be drafted mid-run. `Stopping` covers the moment after stop is pressed.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const textarea = canvas.getByRole("textbox", { name: "Prompt" })

		await expect(
			canvas.queryByRole("button", { name: "Send prompt" }),
		).not.toBeInTheDocument()

		await userEvent.click(textarea)
		await userEvent.keyboard("{Enter}")
		await expect(args.onSubmit).not.toHaveBeenCalled()

		await userEvent.click(
			canvas.getByRole("button", { name: "Stop generating" }),
		)
		await expect(args.onStop).toHaveBeenCalled()
	},
})

export const Stopping = meta.story({
	args: { loading: true, defaultValue: DRAFT },
	parameters: {
		docs: {
			description: {
				story:
					"Stop has been requested and the run is winding down: the host keeps `loading` on but drops `onStop`, so the control stays in place and goes inert instead of accepting a second stop. Check that the button never flips back to send before the turn actually ends. `Loading` covers the stoppable half of the same run.",
			},
		},
	},
	render: (args) => <PromptInput {...args} onStop={undefined} />,
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("button", { name: "Stop generating" }),
		).toBeDisabled()
	},
})
