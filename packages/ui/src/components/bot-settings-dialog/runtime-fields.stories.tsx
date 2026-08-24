import { useState } from "react"
import { expect, fn, screen } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	type BotModelOption,
	DEFAULT_BOT_OUTPUT_STYLE,
} from "@workspace/ui/components/bot-settings"
import {
	RuntimeFields,
	type RuntimeFieldsProps,
} from "@workspace/ui/components/bot-settings-dialog/runtime-fields"

const MODELS: BotModelOption[] = [
	{ label: "Nest Sonnet 4.5", value: "nest-sonnet-4-5" },
	{ label: "Nest Opus 4.1", value: "nest-opus-4-1" },
	{ label: "Nest Haiku 4.5", value: "nest-haiku-4-5" },
]

const LONG_PATH =
	"/Users/wren/Projects/opennest/packages/ui/src/components/bot-settings-dialog"

const RuntimeFieldsHost = (props: RuntimeFieldsProps) => {
	const [model, setModel] = useState(props.model)
	const [outputStyle, setOutputStyle] = useState(props.outputStyle)
	const [changesNothing, setChangesNothing] = useState(props.changesNothing)

	return (
		<RuntimeFields
			{...props}
			changesNothing={changesNothing}
			model={model}
			onChangesNothingChange={(next) => {
				setChangesNothing(next)
				props.onChangesNothingChange(next)
			}}
			onModelChange={(next) => {
				setModel(next)
				props.onModelChange(next)
			}}
			onOutputStyleChange={(next) => {
				setOutputStyle(next)
				props.onOutputStyleChange?.(next)
			}}
			outputStyle={outputStyle}
		/>
	)
}

const meta = preview.meta({
	title: "AI/RuntimeFields",
	component: RuntimeFields,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"What a bot runs on: the model behind it, the folder it works in, and whether it may change anything there. The first two are pickers, never text, because neither is something a reader can type correctly — a mistyped model is a bot that never answers and a mistyped path is a bot working nowhere. The last is a switch with a sentence under it, because what it stops needs saying: four built-in tools, not everything the bot can reach. Neither field owns anything: the model list comes from the host, and pressing the folder hands the ask back rather than opening a picker itself, which is what keeps the native dialog on the app's side of the line.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex w-full max-w-md flex-col gap-4">
				<Story />
			</div>
		),
	],
	args: {
		models: MODELS,
		model: "nest-sonnet-4-5",
		outputStyle: DEFAULT_BOT_OUTPUT_STYLE,
		workingDirectory: "/Users/wren/Projects/opennest",
		changesNothing: false,
		onModelChange: fn(),
		onOutputStyleChange: fn(),
		onBrowseWorkingDirectory: fn(),
		onChangesNothingChange: fn(),
	},
	render: (args) => <RuntimeFieldsHost {...args} />,
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Knob story for both fields. Check that the labels sit above their controls at the same rhythm, that the model trigger and the folder button share a height, and that the group needs no fieldset around it to read as one.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("combobox", { name: /Model/ }),
		).toHaveTextContent("Nest Sonnet 4.5")
	},
})

export const Filled = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A configured bot: a model out of the host's list and a folder already chosen. The folder row keeps its `Change` affordance on the right even when full, so the row never becomes a label a reader mistakes for read-only text.",
			},
		},
	},
})

export const Concise = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The style a bot is given by default: short answers that lead with the result. The hint under the trigger is the picked style's own, so the reader reads what they chose rather than a sentence about the field.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("combobox", { name: /Answer style/ }),
		).toHaveTextContent("Concise")
		await expect(
			canvas.getByText("Short answers that lead with the result."),
		).toBeVisible()
	},
})

export const StandardAnswers = meta.story({
	args: { outputStyle: "default" },
	parameters: {
		docs: {
			description: {
				story:
					"Claude's standard answers. The value the host stores raw is `default`, and the reader never sees it — the trigger reads `Standard` and the hint changes with it. Check that picking reports the raw value rather than the label.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const style = canvas.getByRole("combobox", { name: /Answer style/ })

		await expect(style).toHaveTextContent("Standard")

		await userEvent.click(style)
		await userEvent.click(
			await screen.findByRole("option", { name: "Concise" }),
		)

		await expect(args.onOutputStyleChange).toHaveBeenCalledWith("Concise")
		await expect(style).toHaveTextContent("Concise")
	},
})

export const Empty = meta.story({
	args: { model: "", workingDirectory: "" },
	parameters: {
		docs: {
			description: {
				story:
					"A bot that has just been created. Both controls hold their size and show a muted instruction rather than an error — nothing is wrong yet, the reader simply has not answered. Check that the placeholders read as prompts to act (`Choose a model`, `Choose a folder`) and that the folder icon stays put, so the row does not shift once a path lands in it.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Choose a folder")).toBeVisible()
	},
})

export const PickingAModel = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The list open over the trigger. Every option gets a fixed indicator column, so the checked one is marked without the labels shifting, and the popup matches the trigger's width and scrolls inside the space available. Check that the choice reports the option's `value`, not its label, and that the trigger takes the new label immediately.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("combobox", { name: /Model/ }))
		await userEvent.click(
			await screen.findByRole("option", { name: "Nest Opus 4.1" }),
		)

		await expect(args.onModelChange).toHaveBeenCalledWith("nest-opus-4-1")
		await expect(
			canvas.getByRole("combobox", { name: /Model/ }),
		).toHaveTextContent("Nest Opus 4.1")
	},
})

export const NoModels = meta.story({
	args: { models: [], model: "" },
	parameters: {
		docs: {
			description: {
				story:
					"The host has no models to offer — the transport is down, or none is installed yet. The trigger still stands and still opens, showing an empty popup rather than a broken one, and the placeholder keeps the row honest. Reach for this to check that a missing list never leaves the group half-drawn.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Choose a model")).toBeVisible()
	},
})

export const LongPath = meta.story({
	args: { workingDirectory: LONG_PATH },
	parameters: {
		docs: {
			description: {
				story:
					"A folder deeper than the control is wide. The path truncates from the end and the full one stays available as the button's title, so the tail a reader needs is never the part that is lost — and `Change` keeps its place at the right edge rather than being pushed out. Check that the row stays one line and that the button still announces its label to a screen reader.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const folder = canvas.getByRole("button", { name: /Working directory/ })

		await expect(folder).toHaveAttribute("title", LONG_PATH)

		await userEvent.click(folder)
		await expect(args.onBrowseWorkingDirectory).toHaveBeenCalledTimes(1)
	},
})

export const ChangesNothing = meta.story({
	args: { changesNothing: true },
	parameters: {
		docs: {
			description: {
				story:
					"A bot held back from editing files and running commands. The sentence under the label is the part to read: it names what is refused and what is not, so nobody leaves this row believing the bot has been made harmless. Check that the switch is the only thing that moves when it is pressed, and that the label is what a screen reader hears first, the sentence after it.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const denial = canvas.getByRole("switch", {
			name: /Cannot change anything itself/,
		})

		await expect(denial).toBeChecked()

		await userEvent.click(denial)
		await expect(args.onChangesNothingChange).toHaveBeenCalledWith(false)
	},
})
