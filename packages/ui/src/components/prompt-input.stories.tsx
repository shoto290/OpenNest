import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { PromptAttachButton } from "@workspace/ui/components/prompt-attach-button"
import { PromptAttachments } from "@workspace/ui/components/prompt-attachments"
import {
	DROPPED_PROMPT_FILE,
	PASTED_PROMPT_FILE,
	PROMPT_ATTACHMENTS,
} from "@workspace/ui/components/prompt-attachments.fixtures"
import { PromptInput } from "@workspace/ui/components/prompt-input"

const DRAFT = "Summarise the release notes for v0.1"

const WRAPPED_DRAFT =
	"Summarise the release notes for v0.1 and tell me which entries changed a public export"

const leadingControls = (
	<Button type="button" variant="ghost" size="icon" aria-label="Add context">
		<Icons.Add />
	</Button>
)

const trailingControls = (
	<Button type="button" variant="ghost" size="icon" aria-label="Search the web">
		<Icons.Web />
	</Button>
)

const attachControl = <PromptAttachButton onAttach={fn()} />

const stagedFiles = (
	<PromptAttachments items={PROMPT_ATTACHMENTS} onRemove={fn()} />
)

const formOf = (element: HTMLElement) =>
	element.closest("form") as HTMLFormElement

const filesTransfer = (files: File[]) => {
	const transfer = new DataTransfer()
	for (const file of files) transfer.items.add(file)
	return transfer
}

const textTransfer = (text: string) => {
	const transfer = new DataTransfer()
	transfer.setData("text/plain", text)
	return transfer
}

const drag = (
	kind: "dragover" | "dragleave" | "dragend" | "drop",
	target: HTMLElement,
	init: DragEventInit = {},
) =>
	!target.dispatchEvent(
		new DragEvent(kind, { bubbles: true, cancelable: true, ...init }),
	)

const pasteInto = (target: HTMLElement, clipboardData: DataTransfer) =>
	!target.dispatchEvent(
		new ClipboardEvent("paste", {
			bubbles: true,
			cancelable: true,
			clipboardData,
		}),
	)

const draggingFile = () => ({
	dataTransfer: filesTransfer([DROPPED_PROMPT_FILE]),
})

const named = (file: File) => [expect.objectContaining({ name: file.name })]

const isExpanded = (element: HTMLElement) =>
	formOf(element).dataset.expanded === "true"

const box = (element: HTMLElement) => element.getBoundingClientRect()

const isBefore = (element: HTMLElement, next: HTMLElement) =>
	box(element).right <= box(next).left

const isBelow = (element: HTMLElement, previous: HTMLElement) =>
	box(element).top >= box(previous).bottom

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
					"The composer for a prompt: write it and send it, whatever the session is doing. At rest it is a one-line pill — the `leading` slot, the prompt, then the `trailing` slot and the send button, all on the same row. The moment the prompt no longer fits beside them the bar expands: the prompt takes a row of its own and the controls drop below it, `leading` on the leading edge, `trailing` and send on the trailing one. Enter sends and Shift+Enter breaks a line in both layouts. It knows nothing about a running turn: a prompt written mid-run is sent like any other and waits in the transcript as a pending `UserTurn`, and stopping the run belongs to the working bot's avatar in `Feedback/ActivityIndicator`.",
			},
		},
	},
	args: {
		onSubmit: fn(),
		onValueChange: fn(),
		onAttach: fn(),
	},
	argTypes: {
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
					"The knob story, and the keyboard contract in one pass: typing, Shift+Enter for a second line, Enter to send. Check that Shift+Enter never fires `onSubmit`, that Enter sends the trimmed value, that the bar expands on the second line and folds back into a pill once the field is cleared, and that an uncontrolled input clears itself afterwards.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const textarea = canvas.getByRole("textbox", { name: "Prompt" })

		await userEvent.click(textarea)
		await userEvent.type(textarea, "Draft the changelog")

		await expect(isExpanded(textarea)).toBe(false)

		await userEvent.keyboard("{Shift>}{Enter}{/Shift}")
		await userEvent.type(textarea, "for v0.1")

		await expect(textarea).toHaveValue("Draft the changelog\nfor v0.1")
		await expect(isExpanded(textarea)).toBe(true)
		await expect(args.onSubmit).not.toHaveBeenCalled()

		await userEvent.keyboard("{Enter}")

		await expect(args.onSubmit).toHaveBeenCalledWith(
			"Draft the changelog\nfor v0.1",
		)
		await expect(textarea).toHaveValue("")
		await expect(isExpanded(textarea)).toBe(false)
	},
})

export const Default = meta.story({
	args: { defaultValue: DRAFT },
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: a draft short enough to sit beside the send button, so the composer stays the one-line pill it is at rest. This is the story to open when reviewing the focus ring, the fully rounded container and the enabled send button. Check that the ring reads on the whole composer rather than on the textarea alone, that prompt and button share a row, and that Enter sends without a click. `LongContent` covers the same input once the prompt wraps.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const textarea = canvas.getByRole("textbox", { name: "Prompt" })
		const send = canvas.getByRole("button", { name: "Send prompt" })

		await userEvent.click(textarea)
		await expect(textarea).toHaveFocus()
		await expect(send).toBeEnabled()
		await expect(isExpanded(textarea)).toBe(false)
		await expect(box(send).top).toBeLessThan(box(textarea).bottom)

		await userEvent.keyboard("{Enter}")

		await expect(args.onSubmit).toHaveBeenCalledWith(DRAFT)
		await expect(textarea).toHaveValue("")
	},
})

export const WithControls = meta.story({
	args: {
		defaultValue: DRAFT,
		leading: leadingControls,
		trailing: trailingControls,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Both slots filled while the pill is still one line: `leading` opens the pill before the text, `trailing` sits right before send. Reach for it when adding a control to the composer — it is the layout that runs out of room first. Check that `leading` reads on the leading edge rather than beside the send button, that `trailing` and send stay grouped against the trailing edge with the prompt taking the remaining width, and that filling the slots shortens the prompt's single line rather than wrapping the bar early. `LongContent` shows where the same controls land once the prompt wraps.",
			},
		},
	},
	play: async ({ canvas }) => {
		const textarea = canvas.getByRole("textbox", { name: "Prompt" })
		const addContext = canvas.getByRole("button", { name: "Add context" })
		const search = canvas.getByRole("button", { name: "Search the web" })
		const send = canvas.getByRole("button", { name: "Send prompt" })

		await expect(isExpanded(textarea)).toBe(false)
		await expect(isBefore(addContext, textarea)).toBe(true)
		await expect(isBefore(textarea, search)).toBe(true)
		await expect(isBefore(search, send)).toBe(true)
	},
})

export const LongContent = meta.story({
	args: {
		defaultValue: WRAPPED_DRAFT,
		leading: leadingControls,
		trailing: trailingControls,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A prompt long enough to stop fitting beside the controls, so the bar has expanded: the textarea owns the top row and the control row sits under it, `leading` on the leading edge, `trailing` and send on the trailing one. Check that the container softens from the pill to the rounded box without the controls jumping, that `leading` holds the same leading edge it had in the pill, that the prompt now uses the full width, and that deleting back to a short prompt folds it into `Default` again. `Overflow` pushes the same layout past `maxRows`.",
			},
		},
	},
	play: async ({ canvas }) => {
		const textarea = canvas.getByRole("textbox", { name: "Prompt" })
		const send = canvas.getByRole("button", { name: "Send prompt" })
		const addContext = canvas.getByRole("button", { name: "Add context" })

		await expect(isExpanded(textarea)).toBe(true)
		await expect(isBelow(addContext, textarea)).toBe(true)
		await expect(isBelow(send, textarea)).toBe(true)
		await expect(box(addContext).left).toBeLessThanOrEqual(box(textarea).left)
		await expect(isBefore(addContext, send)).toBe(true)
	},
})

export const Empty = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Nothing typed yet — the resting state of a new turn, and the narrowest the composer ever gets. Check that the placeholder stays readable against the surface and that the send button is absent rather than disabled, since there is neither a prompt nor a staged file to send yet and a blank value must never reach `onSubmit` on its own. `Default` covers the same input once a draft exists, `FilesOnly` once a chip alone carries the turn.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.queryByRole("button", { name: "Send prompt" }),
		).not.toBeInTheDocument()
		await expect(
			isExpanded(canvas.getByRole("textbox", { name: "Prompt" })),
		).toBe(false)
	},
})

export const States = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every state of the composer stacked, idle to disabled. Reach for it when changing the border, ring or opacity tokens: the second instance is focused by the play function, so the focus ring can be compared against the resting border without touching the canvas. Check that disabled dims the whole composer, blocks the textarea and takes its `leading` and `trailing` controls out of reach of both pointer and Tab, and that the idle instance carries no send button at all until something is worth sending.",
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
				leading={leadingControls}
				trailing={trailingControls}
				attachments={stagedFiles}
				aria-label="Disabled prompt"
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
		await expect(
			canvas.getAllByRole("button", { name: "Send prompt" }),
		).toHaveLength(2)

		const addContext = canvas.getByRole("button", { name: "Add context" })
		const remove = canvas.getByRole("button", {
			name: `Remove ${PROMPT_ATTACHMENTS[0].name}`,
		})

		addContext.focus()
		await expect(addContext).not.toHaveFocus()

		remove.focus()
		await expect(remove).not.toHaveFocus()
	},
})

export const Overflow = meta.story({
	args: { defaultValue: LONG_DRAFT, maxRows: 6 },
	parameters: {
		docs: {
			description: {
				story:
					"A multi-paragraph prompt past `maxRows`, the far end of the expanded layout. Check that the field grows line by line up to the cap and then scrolls instead of pushing the control row off screen, and that the last line stays visible while typing. `LongContent` covers the prompt that only just wraps; lower `maxRows` in the Playground to reproduce the cap on a shorter prompt.",
			},
		},
	},
	play: async ({ canvas }) => {
		const textarea = canvas.getByRole("textbox", { name: "Prompt" })

		await expect(isExpanded(textarea)).toBe(true)
		await expect(textarea.scrollHeight).toBeGreaterThan(textarea.clientHeight)
	},
})

export const WithAttachments = meta.story({
	args: {
		defaultValue: DRAFT,
		leading: attachControl,
		attachments: stagedFiles,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Files staged for the turn: the chips take the top of the composer, inside the same container as the text, and the composer holds its expanded shape whatever the prompt is worth. This is also the story for the two silent ways in — a drop on the composer and a paste into the textarea both report their files to `onAttach` and suppress the browser's own handling, while a drop carrying no file and a paste carrying text are handed straight back to it. Check that the row never overlaps the text, that dropping is suppressed rather than opening the file in a new tab, and that the composer folds back to the pill once the last chip is taken back — `PromptAttachments → InComposer` does the removing.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		const textarea = canvas.getByRole("textbox", { name: "Prompt" })
		const form = formOf(textarea)
		const chip = canvas.getAllByRole("listitem")[0]

		await expect(isExpanded(textarea)).toBe(true)
		await expect(box(chip).bottom).toBeLessThanOrEqual(box(textarea).top)

		await expect(drag("drop", form, draggingFile())).toBe(true)
		await expect(pasteInto(textarea, filesTransfer([PASTED_PROMPT_FILE]))).toBe(
			true,
		)
		await expect(args.onAttach).toHaveBeenCalledWith(named(DROPPED_PROMPT_FILE))
		await expect(args.onAttach).toHaveBeenCalledWith(named(PASTED_PROMPT_FILE))

		await expect(drag("drop", form, { dataTransfer: new DataTransfer() })).toBe(
			false,
		)
		await expect(pasteInto(textarea, textTransfer("plain words"))).toBe(false)
		await expect(args.onAttach).toHaveBeenCalledTimes(2)
	},
})

export const DragOver = meta.story({
	args: { defaultValue: DRAFT, leading: attachControl },
	parameters: {
		docs: {
			description: {
				story:
					"A file is being dragged over the composer and has not been let go yet. Check that the whole composer takes the highlight — border and surface together, so the target reads as one place to drop — that the highlight survives the drag crossing the textarea and the buttons inside it, and that it clears the moment the pointer leaves the composer or the drag ends over it, whether or not the composer went disabled midway. Reach for it when tuning the drop tokens; `WithAttachments` covers what the drop itself does.",
			},
		},
	},
	play: async ({ canvas }) => {
		const textarea = canvas.getByRole("textbox", { name: "Prompt" })
		const form = formOf(textarea)

		await expect(drag("dragover", form, draggingFile())).toBe(true)
		await waitFor(() => expect(form.dataset.dropTarget).toBe("true"))

		drag("dragleave", form, { relatedTarget: textarea })
		await expect(form.dataset.dropTarget).toBe("true")

		drag("dragleave", form, { relatedTarget: document.body })
		await waitFor(() => expect(form.dataset.dropTarget).toBe("false"))

		drag("dragover", form, draggingFile())
		await waitFor(() => expect(form.dataset.dropTarget).toBe("true"))

		drag("dragend", form)
		await waitFor(() => expect(form.dataset.dropTarget).toBe("false"))
	},
})

export const MarkedFromOutside = meta.story({
	args: { defaultValue: DRAFT, leading: attachControl, dropTarget: true },
	parameters: {
		docs: {
			description: {
				story:
					"The same highlight, asked for by the host rather than by the composer's own drag events — a file dragged anywhere over the surface around it lights the composer up as the place to drop. Check that the mark is the one `DragOver` produces, and that a drag crossing the composer and leaving it again cannot take it away while the host still asks for it. The second instance is disabled: a composer that has nowhere to put the file stays unmarked whatever the host asks, so nothing invites a drop the browser would end up opening itself.",
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-4">
			<PromptInput {...args} aria-label="Prompt" />
			<PromptInput {...args} disabled aria-label="Disabled prompt" />
		</div>
	),
	play: async ({ canvas }) => {
		const form = formOf(canvas.getByRole("textbox", { name: "Prompt" }))
		const disabled = formOf(
			canvas.getByRole("textbox", { name: "Disabled prompt" }),
		)

		await expect(form.dataset.dropTarget).toBe("true")
		await expect(disabled.dataset.dropTarget).toBe("false")

		drag("dragover", form, draggingFile())
		drag("dragleave", form, { relatedTarget: document.body })
		drag("dragend", form)
		await expect(form.dataset.dropTarget).toBe("true")
	},
})

export const FilesOnly = meta.story({
	args: { leading: attachControl, attachments: stagedFiles },
	parameters: {
		docs: {
			description: {
				story:
					"Files staged with nothing typed: the turn is worth sending on the chips alone, so the send button is there even though the prompt is blank and `onSubmit` receives an empty string. Check that the button appears with the first chip and that `Empty` still hides it when the composer carries neither.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const send = await canvas.findByRole("button", { name: "Send prompt" })

		await expect(send).toBeEnabled()
		await userEvent.click(send)
		await expect(args.onSubmit).toHaveBeenCalledWith("")
	},
})
