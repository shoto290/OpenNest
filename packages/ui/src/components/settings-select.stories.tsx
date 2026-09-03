import { useState } from "react"
import { expect, fn, screen, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { FRAME_POLL } from "@workspace/storybook/story-utils"
import {
	SettingsSelect,
	type SettingsSelectProps,
} from "@workspace/ui/components/settings-select"

const MODELS = [
	{ label: "Claude Sonnet", value: "claude-sonnet" },
	{ label: "Claude Opus", value: "claude-opus" },
	{ label: "Claude Haiku", value: "claude-haiku" },
]

const SelectHost = (props: SettingsSelectProps) => {
	const [value, setValue] = useState(props.value)

	return (
		<SettingsSelect
			{...props}
			onValueChange={(next) => {
				setValue(next)
				props.onValueChange(next)
			}}
			value={value}
		/>
	)
}

const meta = preview.meta({
	title: "Forms/SettingsSelect",
	component: SettingsSelect,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One setting picked from a closed set: the label, the trigger reading the current answer, and the list hanging off it. The same control wherever a settings surface asks a question whose answers are known — a model, an effort, a context — so they cannot drift apart. It keeps no state: the surface holds the answer and this reports the pick.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="w-72">
				<Story />
			</div>
		),
	],
	render: (args) => <SelectHost {...args} />,
	args: {
		label: "Model",
		options: MODELS,
		value: "claude-sonnet",
		onValueChange: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A question already answered. Check that the trigger reads the answer rather than the value behind it, that the open list marks the current one with a tick in its own column so the names stay aligned, and that Escape closes the list without changing the answer.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("combobox"))
		await screen.findByRole("listbox", { name: "Model" })
		await userEvent.click(
			await screen.findByRole("option", { name: "Claude Opus" }),
		)

		await waitFor(async () => {
			await expect(screen.queryByRole("listbox")).toBeNull()
		}, FRAME_POLL)

		await expect(args.onValueChange).toHaveBeenLastCalledWith("claude-opus")
	},
})

export const Empty = meta.story({
	args: { value: "", placeholder: "Choose a model" },
	parameters: {
		docs: {
			description: {
				story:
					"A question nobody has answered. Reach for this over `Default` to check that the placeholder reads as unanswered rather than as an answer — it is muted, and no option is ticked when the list opens.",
			},
		},
	},
})

export const Error = meta.story({
	args: {
		error: "This model is not available on the plan this bot runs on.",
		value: "claude-opus",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The answer a write came back refusing. Reach for this over `Default` to check that the trigger reads invalid rather than only turning red, that the message is tied to it by `aria-describedby` so a screen reader hears it on the control, and that the answer the reader picked is still the one on screen. A hint and a refusal can be read together; the refusal never replaces the hint.",
			},
		},
	},
	play: async ({ canvas }) => {
		const trigger = canvas.getByRole("combobox")
		const message = canvas.getByText(
			"This model is not available on the plan this bot runs on.",
		)

		await expect(trigger).toHaveAttribute("aria-invalid", "true")
		await expect(trigger.getAttribute("aria-describedby")).toContain(message.id)
	},
})

export const WithHint = meta.story({
	args: {
		hint: "Left empty, this skill's turn runs on the model the bot runs on.",
		placeholder: "The bot's own",
		value: "",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The rule under the control, in the same place a text field's is read. Reach for this whenever what the field decides is not obvious from its name — the sentence is announced after the label rather than in place of it, so a screen reader lands on the name first.",
			},
		},
	},
})
