import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	Checkbox,
	type CheckboxProps,
} from "@workspace/ui/components/motion/checkbox"

const CheckboxHost = (props: CheckboxProps) => {
	const [checked, setChecked] = useState(props.checked)

	return (
		<Checkbox
			{...props}
			checked={checked}
			onCheckedChange={(next) => {
				setChecked(next)
				props.onCheckedChange(next)
			}}
		/>
	)
}

const meta = preview.meta({
	title: "Forms/Checkbox",
	component: Checkbox,
	render: (args) => <CheckboxHost {...args} />,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One choice among several that hold at once, submitted later rather than written on press — reach for `Switch` instead whenever there is no submit to wait for. The mark draws itself in and blurs out, unless the reader asked for no motion, in which case it appears. It renders a button, so a `label` owns it through `htmlFor` and the words beside it are part of the same target, and it holds no value: the surface owns the state and this only reports the press.",
			},
		},
	},
	args: {
		checked: false,
		label: "Include the onboarding screens",
		onCheckedChange: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The resting, unchecked state and the press that checks it. Check that the box fills rather than only outlining, that the mark draws in from its start rather than fading as a whole, and that clicking the words beside the box toggles it too.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const control = canvas.getByRole("checkbox")

		await expect(control).toHaveAttribute("aria-checked", "false")
		await userEvent.click(control)
		await expect(args.onCheckedChange).toHaveBeenCalledWith(true)
		await expect(control).toHaveAttribute("aria-checked", "true")
	},
})

export const States = meta.story({
	parameters: {
		pseudo: { focusVisible: "#checkbox-focus" },
		docs: {
			description: {
				story:
					"The matrix: unchecked, checked, the mixed state a parent takes when some of its children are on, focused, and both disabled ends. Check that focus draws a ring clear of the box's own border, and that a disabled box still reads its state — dimming it must not make on and off look alike.",
			},
		},
	},
	render: () => (
		<div className="flex items-center gap-4">
			<Checkbox aria-label="Unchecked" checked={false} onCheckedChange={fn()} />
			<Checkbox aria-label="Checked" checked onCheckedChange={fn()} />
			<Checkbox
				aria-label="Mixed"
				checked={false}
				indeterminate
				onCheckedChange={fn()}
			/>
			<Checkbox
				aria-label="Focused"
				checked
				id="checkbox-focus"
				onCheckedChange={fn()}
			/>
			<Checkbox
				aria-label="Disabled unchecked"
				checked={false}
				disabled
				onCheckedChange={fn()}
			/>
			<Checkbox
				aria-label="Disabled checked"
				checked
				disabled
				onCheckedChange={fn()}
			/>
		</div>
	),
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("checkbox", { name: "Mixed" }),
		).toHaveAttribute("aria-checked", "mixed")
	},
})

export const KeyboardOnly = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The keyboard contract: Tab reaches the box, Space toggles it and Enter toggles it too, since the control is a button. Check that the mark answers the key with the same motion as the press, and that focus stays on the box after it flips.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const control = canvas.getByRole("checkbox")

		await userEvent.tab()
		await expect(control).toHaveFocus()
		await userEvent.keyboard(" ")
		await expect(args.onCheckedChange).toHaveBeenCalledWith(true)
		await expect(control).toHaveFocus()
	},
})
