import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Switch, type SwitchProps } from "@workspace/ui/components/switch"

const SwitchHost = (props: SwitchProps) => {
	const [checked, setChecked] = useState(props.checked)

	return (
		<Switch
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
	title: "Forms/Switch",
	component: Switch,
	render: (args) => <SwitchHost {...args} />,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One binary setting, written the moment it is pressed. Reach for it over a checkbox whenever there is no save button to wait for: the track has to read as the state itself rather than as a choice pending a submit. It renders a button, so a visible `label` owns it through `htmlFor` and the words beside it are part of the same target, and `aria-describedby` is where a consequence goes — the sentence that says what turning it on costs. It holds no value: the surface owns the state and this only reports the press.",
			},
		},
	},
	args: {
		checked: false,
		onCheckedChange: fn(),
		"aria-label": "Preload this skill",
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The resting, off state and the press that turns it on. Check that the thumb slides rather than jumps between the two ends, and that the track fills with the primary rather than only outlining — an off switch and an on one must be distinguishable without reading the label beside them.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const control = canvas.getByRole("switch")

		await expect(control).toHaveAttribute("aria-checked", "false")
		await userEvent.click(control)
		await expect(args.onCheckedChange).toHaveBeenCalledWith(true)
		await expect(control).toHaveAttribute("aria-checked", "true")
	},
})

export const States = meta.story({
	parameters: {
		pseudo: { focusVisible: "#switch-focus" },
		docs: {
			description: {
				story:
					"The matrix: off, on, focused and both disabled ends. Check that focus draws a ring around the whole track rather than around the thumb, and that a disabled switch still reads its state — dimming it must not make on and off look alike.",
			},
		},
	},
	render: () => (
		<div className="flex items-center gap-4">
			<Switch aria-label="Off" checked={false} onCheckedChange={fn()} />
			<Switch aria-label="On" checked onCheckedChange={fn()} />
			<Switch
				aria-label="Focused"
				checked
				id="switch-focus"
				onCheckedChange={fn()}
			/>
			<Switch
				aria-label="Disabled off"
				checked={false}
				disabled
				onCheckedChange={fn()}
			/>
			<Switch
				aria-label="Disabled on"
				checked
				disabled
				onCheckedChange={fn()}
			/>
		</div>
	),
})

export const WithLabel = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this over `Default` whenever the switch carries a consequence: the label names it, the sentence under it says what it costs, and `aria-describedby` reads that sentence after the name instead of in place of it. Check that clicking the words toggles the switch — the label owns the control through `htmlFor`, which is the whole reason it renders a button.",
			},
		},
	},
	render: (args) => (
		<div className="flex w-80 items-start justify-between gap-4">
			<div className="flex flex-col gap-1">
				<label
					className="font-medium text-foreground text-xs"
					htmlFor="switch-preload"
				>
					Preload this skill
				</label>
				<p className="text-muted-foreground text-xs" id="switch-preload-hint">
					A preloaded skill is in this bot's prompt on every turn.
				</p>
			</div>
			<SwitchHost
				{...args}
				aria-describedby="switch-preload-hint"
				aria-label={undefined}
				id="switch-preload"
			/>
		</div>
	),
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByText("Preload this skill"))

		await expect(args.onCheckedChange).toHaveBeenCalledWith(true)
	},
})
