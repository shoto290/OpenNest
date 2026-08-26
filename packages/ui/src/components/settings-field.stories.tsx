import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import {
	SettingsField,
	type SettingsFieldProps,
} from "@workspace/ui/components/settings-field"

const FieldHost = (props: SettingsFieldProps) => {
	const [value, setValue] = useState(props.value)

	return (
		<SettingsField
			{...props}
			onValueChange={(next) => {
				setValue(next)
				props.onValueChange?.(next)
			}}
			value={value}
		/>
	)
}

const meta = preview.meta({
	title: "Forms/SettingsField",
	component: SettingsField,
	render: (args) => (
		<div className="w-80">
			<FieldHost {...args} />
		</div>
	),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One labelled text control, the unit every settings surface is built from. The label owns the control through a generated id, so the whole field is one target for a screen reader and a click on the words lands in the box. It is a single-line input until it is given room: `rows` makes it a textarea of that many lines, `fill` makes it a textarea that takes whatever height its container has left. It never resizes by hand — the surface decides the height, not the reader — and it holds no value of its own, so a host owns the state and this only reports keystrokes.",
			},
		},
	},
	args: {
		label: "Name",
		value: "Nest Keeper",
		onValueChange: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal field: one line, filled. Check that the label names the control — clicking the word puts the caret in the box — that typing reports every keystroke to the host, and that Tab reaches it with a visible ring rather than a bare outline. Pick `ZeroValue` for the empty field, `Multiline` for the prose ones.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByLabelText("Name")

		await userEvent.tab()
		await expect(field).toHaveFocus()

		await userEvent.type(field, "!")
		await expect(field).toHaveValue("Nest Keeper!")
		await expect(args.onValueChange).toHaveBeenCalledWith("Nest Keeper!")
	},
})

export const ZeroValue = meta.story({
	args: {
		value: "",
		placeholder: "Repository archivist",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The field of a bot that has not been given one yet. Check that the placeholder reads as a hint rather than a value — dimmed, and gone on the first keystroke — and that the label still names the control with nothing in it. Pick `Default` for the filled field.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const field = canvas.getByLabelText("Name")

		await expect(field).toHaveValue("")
		await expect(field).toHaveAttribute("placeholder", "Repository archivist")

		await userEvent.type(field, "Atlas")
		await expect(field).toHaveValue("Atlas")
	},
})

export const Multiline = meta.story({
	args: {
		label: "Instructions",
		value: "Say which file you would touch, then the change.",
		rows: 4,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The prose field: `rows` turns the control into a textarea of that many lines. Check that it opens at four lines whatever it holds, that it never grows a resize handle, and that Enter breaks the line instead of leaving the field. Pick `Fill` for the one that takes the room a surface has left.",
			},
		},
	},
	play: async ({ canvas }) => {
		const field = canvas.getByLabelText("Instructions")

		await expect(field.tagName).toBe("TEXTAREA")
		await expect(field).toHaveAttribute("rows", "4")
		await expect(getComputedStyle(field).resize).toBe("none")
	},
})

export const Fill = meta.story({
	args: {
		label: "Instructions",
		value: "Say which file you would touch, then the change.",
		fill: true,
	},
	render: (args) => (
		<div className="flex h-64 w-80 flex-col" data-slot="fill-surface">
			<FieldHost {...args} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The field that is the whole of what a surface shows, on a tab that holds nothing else. Check that the textarea reaches the bottom of its container rather than stopping at its content, and that it gives the label its line first. Pick `Multiline` for the field measured in rows.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const field = canvas.getByLabelText("Instructions")
		const [surface] = slotsIn(canvasElement, "fill-surface")

		await expect(field.tagName).toBe("TEXTAREA")
		await expect(field.getBoundingClientRect().bottom).toBeCloseTo(
			surface.getBoundingClientRect().bottom,
			0,
		)
	},
})

export const WithHint = meta.story({
	args: {
		label: "Name",
		value: "release-notes",
		hint: "Lowercase letters, numbers and hyphens.",
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this over `Default` whenever the field will not take everything a reader might type. The rule goes under the control rather than into the placeholder, because a placeholder is gone the moment they start typing — which is exactly when the rule is worth reading — and it is wired to the control through `aria-describedby`, so it is announced after the label instead of in place of it.",
			},
		},
	},
	play: async ({ canvas }) => {
		const control = canvas.getByLabelText("Name")
		const hint = canvas.getByText("Lowercase letters, numbers and hyphens.")

		await expect(control).toHaveAttribute("aria-describedby", hint.id)
	},
})

export const ReadOnly = meta.story({
	args: {
		label: "Body",
		readOnly: true,
		rows: 4,
		value:
			"# Environment\n\nPlatform: darwin 24.5.0\nShell: /bin/zsh\n\nRead from the machine each time this bot starts.",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A field holding something a reader may read but not write — a skill the host keeps up to date. Check that the neutral fill says so before a keystroke does, that Tab still reaches the control with a visible ring so the text can be read and copied by keyboard, and that typing into it changes nothing and reports nothing.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByLabelText("Body")

		await userEvent.tab()
		await expect(field).toHaveFocus()

		await userEvent.type(field, "!")
		await expect(args.onValueChange).not.toHaveBeenCalled()
	},
})

export const WithIcon = meta.story({
	args: {
		icon: Icons.Search,
		label: "Bots",
		placeholder: "Search bots",
		value: "",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A single-line field carrying a glyph inside the control, the form a search field takes at the head of a list. Check that the glyph is decorative and never reached by Tab, that the text starts clear of it at every value length, and that the visible label still names the control — the glyph hints at the job, it does not replace the label. Only the single-line form takes an icon; a `rows` or `fill` field ignores it.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByLabelText("Bots")

		await userEvent.tab()
		await expect(field).toHaveFocus()

		await userEvent.type(field, "atl")
		await expect(args.onValueChange).toHaveBeenLastCalledWith("atl")
	},
})
