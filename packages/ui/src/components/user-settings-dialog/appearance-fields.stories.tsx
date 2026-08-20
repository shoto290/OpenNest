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

/** The fields keep no scheme or palette of their own, so a story that lets a reader
 * choose holds what the choosing produces. The language is not among them: that one
 * lives in the translation runtime, which the group reads itself. */
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
	title: "Forms/AppearanceFields",
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
					"How the app reads and how it is painted, flat: the languages this build ships a catalogue for, each written in itself; then the three schemes — Light, Dark and System; then the six palettes as tiles. Each tile is the app in miniature drawn in the palette it offers, and every band in it is a token read live from that palette rather than a colour copied out of it, so a palette repainted in the stylesheet is repainted here in both schemes with nothing to keep in sync. Nothing is folded behind a popover: a reader comparing two palettes sees both at once, in the scheme they are reading in. It holds nothing: a scheme and a palette go straight to the host, and the active language is read off the translation runtime rather than passed in.",
			},
		},
	},
	args: {
		...FOLLOWING_THE_MACHINE,
		onColorSchemeChange: fn(),
		onPaletteChange: fn(),
		onLanguageChange: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal panel: two languages, three schemes, six palettes, three tiles a row. Check that exactly one scheme and one palette read as chosen, that the chosen palette is marked with a tick as well as an edge — selection is never colour alone — and that choosing reports the choice immediately. Pick `Languages` for the language group, `TwoColumns` for the narrow dialog.",
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

export const Languages = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The language group, offering exactly what this build ships a catalogue for — the list is the catalogues themselves, so there is no second list to fall out of step with them. Each is written in its own language: a reader lost in a language they cannot read still finds `Français` or `English`. Check that the active one reads as chosen and that picking one reports it immediately — the group holds nothing, so the host is what makes the switch. Pick `InFrench` for the panel once the switch has happened.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const languages = within(canvas.getByRole("group", { name: "Language" }))
		await expect(languages.getAllByRole("radio")).toHaveLength(2)
		await expect(
			languages.getByRole("radio", { name: "English" }),
		).toBeChecked()

		await userEvent.click(languages.getByRole("radio", { name: "Français" }))
		await expect(args.onLanguageChange).toHaveBeenCalledWith("fr")
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
					"The panel read in French, which is the whole point of the group above it: the switch takes hold where the reader is standing, with no restart and no reload. Check that every label around it turned — the legends, the schemes, the palettes — while the language names themselves did not, and that French now reads as the chosen one. Pick `Languages` for the group that gets here.",
			},
		},
	},
	play: async ({ canvas }) => {
		const languages = within(
			await canvas.findByRole("group", { name: "Langue" }),
		)

		await expect(canvas.getByRole("group", { name: "Thème" })).toBeVisible()
		await expect(
			languages.getByRole("radio", { name: "Français" }),
		).toBeChecked()
		await expect(
			languages.getByRole("radio", { name: "English" }),
		).toBeVisible()
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
