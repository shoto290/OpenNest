import { useState } from "react"
import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import type { UserSettingsValue } from "@workspace/ui/components/user-settings"
import {
	AppearanceFields,
	type AppearanceFieldsProps,
} from "@workspace/ui/components/user-settings-dialog/appearance-fields"
import { activateLanguage, DEFAULT_LANGUAGE } from "@workspace/ui/lib/i18n"

type Appearance = Pick<UserSettingsValue, "colorScheme" | "palette">

const FOLLOWING_THE_MACHINE: Appearance = {
	colorScheme: "system",
	palette: "amber",
}

const CHOSEN_DARK: Appearance = {
	colorScheme: "dark",
	palette: "lavender",
}

const AppearanceHost = (props: AppearanceFieldsProps) => {
	const [colorScheme, setColorScheme] = useState(props.colorScheme)
	const [palette, setPalette] = useState(props.palette)

	return (
		<AppearanceFields
			{...props}
			colorScheme={colorScheme}
			onColorSchemeChange={(next) => {
				setColorScheme(next)
				props.onColorSchemeChange(next)
			}}
			onPaletteChange={(next) => {
				setPalette(next)
				props.onPaletteChange(next)
			}}
			palette={palette}
		/>
	)
}

const meta = preview.meta({
	title: "Settings/User/AppearanceFields",
	component: AppearanceFields,
	render: (args) => (
		<div className="w-[26rem]">
			<AppearanceHost {...args} />
		</div>
	),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"How the app is painted, flat: the three schemes — Light, Dark and System — then the six palettes as tiles. Each tile is the app in miniature drawn in the palette it offers, and every band in it is a token read live from that palette rather than a colour copied out of it, so a palette repainted in the stylesheet is repainted here in both schemes with nothing to keep in sync. Nothing is folded behind a popover: a reader comparing two palettes sees both at once, in the scheme they are reading in. It holds nothing: a scheme and a palette go straight to the host. The language lives on its own tab — see `Forms/LanguageFields`.",
			},
		},
	},
	args: {
		...FOLLOWING_THE_MACHINE,
		onColorSchemeChange: fn(),
		onPaletteChange: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal panel: three schemes, six palettes, three tiles a row. Check that exactly one scheme and one palette read as chosen, that the chosen palette is marked with a tick as well as an edge — selection is never colour alone — and that choosing reports the choice immediately. Pick `TwoColumns` for the narrow dialog, `InFrench` for the panel once the reader has switched language.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const schemes = within(canvas.getByRole("group", { name: "Scheme" }))
		await expect(schemes.getAllByRole("radio")).toHaveLength(3)

		await userEvent.click(canvas.getByRole("radio", { name: "Light" }))
		await expect(args.onColorSchemeChange).toHaveBeenCalledWith("light")

		await userEvent.click(canvas.getByRole("radio", { name: "Water" }))
		await expect(args.onPaletteChange).toHaveBeenCalledWith("water")
		await expect(canvas.getByRole("radio", { name: "Water" })).toBeChecked()
	},
})

export const InFrench = meta.story({
	beforeEach: () => {
		activateLanguage("fr")

		return () => activateLanguage(DEFAULT_LANGUAGE)
	},
	parameters: {
		docs: {
			description: {
				story:
					"The panel read in French, which is the whole point of the tab next door: the switch takes hold where the reader is standing, with no restart and no reload. Check that every label turned — the legends, the schemes, the palettes. Pick `Forms/LanguageFields` for the group that gets here.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			await canvas.findByRole("group", { name: "Thème" }),
		).toBeVisible()
		await expect(canvas.getByRole("group", { name: "Palette" })).toBeVisible()
		await expect(canvas.getByRole("radio", { name: "Mousse" })).toBeVisible()
	},
})

export const TwoColumns = meta.story({
	args: { compact: true },
	render: (args) => (
		<div className="w-[19rem]">
			<AppearanceHost {...args} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The panel as the dialog shows it once the rail beside it has dropped to its icons and the room for a third tile is gone. Check that the tiles stay wide enough to read as a window each rather than shrinking to three slivers, and that the scheme row above them keeps all three side by side. Pick `Default` for the wide dialog.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const tiles = slotsIn(canvasElement, "palette-vignette")
		const tops = new Set(
			tiles.map((tile) => Math.round(tile.getBoundingClientRect().top)),
		)

		await expect(tiles).toHaveLength(6)
		await expect(tops.size).toBe(3)
	},
})

export const Dark = meta.story({
	globals: { theme: "dark" },
	args: CHOSEN_DARK,
	parameters: {
		docs: {
			description: {
				story:
					"The six palettes read in the dark scheme. This is the story that proves the tiles read their colours from the palette rather than from a copy of it: every tile repaints itself in that palette's dark tokens, so a reader in the dark scheme compares palettes as they will actually see them. Pick `Default` for the light scheme.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [amber, , , , , lavender] = slotsIn(canvasElement, "palette-vignette")
		const primaryOf = (element: Element) =>
			getComputedStyle(element).getPropertyValue("--primary")

		await expect(primaryOf(amber)).toBe(primaryOf(canvasElement))
		await expect(primaryOf(lavender)).not.toBe(primaryOf(canvasElement))
	},
})
