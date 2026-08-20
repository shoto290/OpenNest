import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { PromptAttachButton } from "@workspace/ui/components/prompt-attach-button"
import {
	DROPPED_PROMPT_FILE,
	PASTED_PROMPT_FILE,
} from "@workspace/ui/components/prompt-attachments.fixtures"

const meta = preview.meta({
	title: "AI/PromptAttachButton",
	component: PromptAttachButton,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The composer's way in for a file that is not dropped or pasted: the control that sits in the `leading` slot of `PromptInput`, opens the system picker and reports what came back. It takes several files at once and refuses none by type — what the agent can do with a file is the host's call, not this button's. It holds nothing: the files go straight to `onAttach`, and the chips come back through `PromptAttachments`.",
			},
		},
	},
	args: { onAttach: fn() },
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The resting control. Check that the picker is named `Attach files` for a screen reader even though the button carries only a glyph, that picking several files reports them in one call rather than one call each, and that the input clears itself so the same file can be picked twice in a row.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const input = canvas.getByLabelText("Attach files", { selector: "input" })

		await userEvent.upload(input, [DROPPED_PROMPT_FILE, PASTED_PROMPT_FILE])

		await expect(args.onAttach).toHaveBeenCalledWith([
			DROPPED_PROMPT_FILE,
			PASTED_PROMPT_FILE,
		])
		await expect(input).toHaveValue("")
	},
})

export const States = meta.story({
	parameters: {
		pseudo: {
			hover: "#attach-hover button",
			focusVisible: "#attach-focus button",
		},
		docs: {
			description: {
				story:
					"Idle, hover, focus and disabled side by side. Reach for it when changing the composer's ghost controls: the button sits on the composer surface rather than on the page, so its hover fill has to read against the input background. Check that the focus ring stays inside the composer padding and that the disabled control dims without leaving a pointer target — a disabled composer must not open a picker.",
			},
		},
	},
	render: (args) => (
		<div className="flex items-center gap-2">
			<PromptAttachButton {...args} />
			<span id="attach-hover">
				<PromptAttachButton {...args} />
			</span>
			<span id="attach-focus">
				<PromptAttachButton {...args} />
			</span>
			<PromptAttachButton {...args} disabled />
		</div>
	),
	play: async ({ canvas }) => {
		const [, , , disabled] = canvas.getAllByRole("button", {
			name: "Attach files",
		})

		await expect(disabled).toBeDisabled()

		disabled.focus()
		await expect(disabled).not.toHaveFocus()
	},
})
