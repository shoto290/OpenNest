import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"
import {
	SpaceFields,
	type SpaceFieldsProps,
} from "@workspace/ui/components/space-settings-dialog/space-fields"

const FILLED_SPACE: SpaceSettingsValue = {
	name: "Release desk",
	colour: "blue",
}

const FieldsHost = (props: SpaceFieldsProps) => {
	const [value, setValue] = useState(props.value)

	return (
		<SpaceFields
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
	title: "Forms/SpaceFields",
	component: SpaceFields,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"What a space is called and the tint it is recognised by, the two fields that make up the space's own entry in its settings. The tint row offers the eight tints a bot's blot takes, as swatches rather than names, with the chosen one carrying a tick so the choice survives a reader who cannot tell the pastels apart. Both fields are fully controlled and report the whole value on every keystroke and every pick — there is no draft here and nothing to save. Deleting the space is not here: it lives in its own danger zone, `SpaceDangerZone`.",
			},
		},
	},
	args: {
		value: FILLED_SPACE,
		onValueChange: fn(),
	},
	render: (args) => <FieldsHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal pair on a named space. Check that typing reports the edited name with the tint untouched, and that the chosen swatch is marked by a tick and a filled well, not by colour alone. Pick `Recoloured` for the swatch row being used.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Name"), "!")
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk!",
			colour: "blue",
		})

		await expect(slotsIn(canvasElement, "space-tint")).toHaveLength(8)
		await expect(canvas.getByRole("radio", { name: "Blue" })).toBeChecked()
	},
})

export const Recoloured = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The swatch row being used. Check that each of the eight tints is reachable by name to a screen reader though it shows no text, that the arrow keys walk the row as one radio group, and that a pick reports the tint with the name untouched — the two fields never overwrite each other. Pick `Default` for the pair at rest.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const swatches = canvas.getAllByRole("radio")

		await expect(swatches).toHaveLength(8)

		await userEvent.click(canvas.getByRole("radio", { name: "Green" }))
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk",
			colour: "green",
		})
		await expect(canvas.getByRole("radio", { name: "Green" })).toBeChecked()
	},
})

export const Empty = meta.story({
	args: { value: { name: "", colour: "orange" } },
	parameters: {
		docs: {
			description: {
				story:
					"A space nobody has named yet. Check that the field stays empty behind its placeholder rather than being filled with a fallback — the fallback is what the dialog calls the space in its breadcrumb and its confirmation, never a value written into the record.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByLabelText("Name")).toHaveValue("")
		await expect(canvas.getByRole("radio", { name: "Orange" })).toBeChecked()
	},
})
