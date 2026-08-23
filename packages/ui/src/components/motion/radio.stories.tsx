import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	RadioGroup,
	RadioGroupItem,
} from "@workspace/ui/components/motion/radio"

const meta = preview.meta({
	title: "Forms/RadioGroup",
	component: RadioGroup,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One choice out of a closed set, where picking a second releases the first — reach for `Checkbox` whenever several may hold at once. The dot glides from the option it leaves to the one it lands on, since every item shares one layout id, and it lands without travelling when the reader asked for no motion. The group holds the value itself unless a `value` is passed, so it works uncontrolled in a story and controlled in a surface.",
			},
		},
	},
	args: { children: null, onValueChange: fn() },
})

export const Default = meta.story({
	args: { defaultValue: "vite" },
	render: (args) => (
		<RadioGroup {...args}>
			<RadioGroupItem label="Next.js" value="next" />
			<RadioGroupItem label="Vite" value="vite" />
			<RadioGroupItem label="Remix" value="remix" />
		</RadioGroup>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Three options with one held. Check that picking another releases the first without a second press, that the dot glides between the two rather than blinking, and that clicking the words beside a circle picks it.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByRole("radio", { name: "Vite" })).toHaveAttribute(
			"aria-checked",
			"true",
		)

		await userEvent.click(canvas.getByRole("radio", { name: "Remix" }))
		await expect(args.onValueChange).toHaveBeenCalledWith("remix")
		await expect(canvas.getByRole("radio", { name: "Vite" })).toHaveAttribute(
			"aria-checked",
			"false",
		)
	},
})

export const Horizontal = meta.story({
	args: { defaultValue: "now", orientation: "horizontal" },
	render: (args) => (
		<RadioGroup {...args}>
			<RadioGroupItem label="Now" value="now" />
			<RadioGroupItem label="Next week" value="later" />
			<RadioGroupItem label="Unreleased" disabled value="never" />
		</RadioGroup>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The row form, for two or three short options that read as a single sentence, with one option refused. Check that the row wraps rather than overflowing when the container narrows, and that the disabled option is still legible while it refuses both the pointer and the press.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const refused = canvas.getByRole("radio", { name: "Unreleased" })

		await expect(refused).toBeDisabled()
		await userEvent.click(refused)
		await expect(args.onValueChange).not.toHaveBeenCalled()
	},
})

export const KeyboardOnly = meta.story({
	render: (args) => (
		<RadioGroup {...args}>
			<RadioGroupItem label="Unit only" value="unit" />
			<RadioGroupItem label="Unit and play" value="play" />
		</RadioGroup>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A group opening with nothing held, reached by the keyboard alone. Every item renders a button, so Tab travels item by item and Space picks the one focused. Check that no option is held on arrival — an unanswered group must not look answered.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.tab()
		await expect(canvas.getByRole("radio", { name: "Unit only" })).toHaveFocus()

		await userEvent.tab()
		const second = canvas.getByRole("radio", { name: "Unit and play" })
		await expect(second).toHaveFocus()
		await userEvent.keyboard(" ")

		await expect(args.onValueChange).toHaveBeenCalledWith("play")
		await expect(second).toHaveAttribute("aria-checked", "true")
	},
})
