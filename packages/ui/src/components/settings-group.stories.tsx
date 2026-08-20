import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { SettingsGroup } from "@workspace/ui/components/settings-group"
import { FIELD_OPTION_CLASS } from "@workspace/ui/components/settings-styles"

const SIZES = ["Small", "Medium", "Large"]

type OptionProps = { label: string; checked: boolean }

const Option = ({ label, checked }: OptionProps) => (
	<label className={FIELD_OPTION_CLASS}>
		<input
			className="sr-only"
			defaultChecked={checked}
			name="settings-group-demo"
			type="radio"
			value={label}
		/>
		<span className="text-xs">{label}</span>
	</label>
)

const meta = preview.meta({
	title: "Forms/SettingsGroup",
	component: SettingsGroup,
	render: (args) => (
		<div className="w-80">
			<SettingsGroup {...args}>
				{SIZES.map((size) => (
					<Option checked={size === "Medium"} key={size} label={size} />
				))}
			</SettingsGroup>
		</div>
	),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One named set of choices inside a settings surface: a legend, then the options on the grid the caller asks for. Every group in every settings dialog is this one — the animals of a bot, the schemes and palettes of a reader — so the label of one set cannot drift from the label of another. It is a fieldset with a legend rather than a heading over a div, which is what makes a screen reader announce the set's name with every option a reader lands on.",
			},
		},
	},
	args: { label: "Size", grid: "grid-cols-3 gap-1.5", children: null },
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A group of three named choices. Check that the legend sits above the grid in muted small caps weight rather than competing with the field labels beside it, and that the set is announced by name when focus enters it. Pick `LongContent` for the label that outgrows its column.",
			},
		},
	},
	play: async ({ canvas }) => {
		const group = canvas.getByRole("group", { name: "Size" })

		await expect(group).toBeVisible()
		await expect(canvas.getAllByRole("radio")).toHaveLength(3)
	},
})

export const LongContent = meta.story({
	args: { label: "Density of the list rows", grid: "grid-cols-2 gap-1.5" },
	parameters: {
		docs: {
			description: {
				story:
					"A legend longer than one column and a grid two wide. Check that the legend wraps above the grid instead of pushing the options sideways, and that the grid keeps its columns rather than following the length of the label. Pick `Default` for the nominal group.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("group", { name: "Density of the list rows" }),
		).toBeVisible()
	},
})
