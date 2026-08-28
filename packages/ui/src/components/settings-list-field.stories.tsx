import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	SettingsListField,
	type SettingsListFieldProps,
} from "@workspace/ui/components/settings-list-field"

const ListHost = (props: SettingsListFieldProps) => {
	const [items, setItems] = useState(props.items)

	return (
		<SettingsListField
			{...props}
			items={items}
			onItemsChange={(next) => {
				setItems(next)
				props.onItemsChange(next)
			}}
		/>
	)
}

const meta = preview.meta({
	title: "Forms/SettingsListField",
	component: SettingsListField,
	render: (args) => (
		<div className="w-96">
			<ListHost {...args} />
		</div>
	),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A list the reader writes one line at a time: type, press Add, and the line joins the rows underneath with its own way out. Reach for it wherever a setting is a set rather than a sentence — permission rules, folders, anything the reader collects. The field refuses a line it cannot accept instead of taking it and losing it later, and it says why under the input.",
			},
		},
	},
	args: {
		label: "Denied",
		items: ["Bash", "Edit"],
		onItemsChange: fn(),
		placeholder: "Tool or Tool(specifier)",
		addLabel: "Add",
		removeLabel: (item: string) => `Remove ${item}`,
		emptyLabel: "Nothing listed.",
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Knob story. Check that a long line truncates in its row rather than widening the panel, and that the Add button keeps its size while the input takes the rest.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Denied"), "Write")
		await userEvent.click(canvas.getByRole("button", { name: "Add" }))

		await expect(args.onItemsChange).toHaveBeenCalledWith([
			"Bash",
			"Edit",
			"Write",
		])
	},
})

export const Empty = meta.story({
	args: { items: [] },
	parameters: {
		docs: {
			description: {
				story:
					"Nothing collected yet. The sentence stands where the rows will be, so the field never collapses to an input floating alone.",
			},
		},
	},
})

export const Refused = meta.story({
	args: {
		isItemValid: (item: string) =>
			/^[A-Za-z_][A-Za-z0-9_-]*(\(.+\))?$/.test(item),
		invalidMessage: "Write a rule as Tool or Tool(specifier).",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A line the field cannot accept. It stays in the input, marked and explained, and the list is left as it was — nothing is silently dropped.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Denied"), "not a rule!")
		await userEvent.click(canvas.getByRole("button", { name: "Add" }))

		await expect(args.onItemsChange).not.toHaveBeenCalled()
		await expect(canvas.getByRole("alert")).toBeVisible()
	},
})

export const Removing = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every row carries its own way out, named after the line it removes, so a reader hearing the buttons one by one knows which is which.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Remove Bash" }))

		await expect(args.onItemsChange).toHaveBeenCalledWith(["Edit"])
	},
})
