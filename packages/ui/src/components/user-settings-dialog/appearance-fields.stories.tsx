import { useState } from "react"
import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import type { UserSettingsValue } from "@workspace/ui/components/user-settings"
import {
	AppearanceFields,
	type AppearanceFieldsProps,
} from "@workspace/ui/components/user-settings-dialog/appearance-fields"
import { activateLanguage, DEFAULT_LANGUAGE } from "@workspace/ui/lib/i18n"

type Appearance = Pick<UserSettingsValue, "colorScheme">

const FOLLOWING_THE_MACHINE: Appearance = { colorScheme: "system" }

const CHOSEN_DARK: Appearance = { colorScheme: "dark" }

const AppearanceHost = (props: AppearanceFieldsProps) => {
	const [colorScheme, setColorScheme] = useState(props.colorScheme)

	return (
		<AppearanceFields
			{...props}
			colorScheme={colorScheme}
			onColorSchemeChange={(next) => {
				setColorScheme(next)
				props.onColorSchemeChange(next)
			}}
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
					"How the app is painted: the three schemes — Light, Dark and System — side by side, each named and carrying its own icon. The app paints itself in one set of colours, so the scheme is the whole of this panel. It holds nothing: the scheme goes straight to the host. The language lives on its own tab — see `Forms/LanguageFields`.",
			},
		},
	},
	args: {
		...FOLLOWING_THE_MACHINE,
		onColorSchemeChange: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal panel: the three schemes, three to a row. Check that exactly one reads as chosen and that choosing another reports the choice immediately. Pick `InFrench` for the panel once the reader has switched language, `Dark` for the same panel read in the dark scheme.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const schemes = within(canvas.getByRole("group", { name: "Scheme" }))
		await expect(schemes.getAllByRole("radio")).toHaveLength(3)

		await userEvent.click(canvas.getByRole("radio", { name: "Light" }))
		await expect(args.onColorSchemeChange).toHaveBeenCalledWith("light")
		await expect(canvas.getByRole("radio", { name: "Light" })).toBeChecked()
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
					"The panel read in French, which is the whole point of the tab next door: the switch takes hold where the reader is standing, with no restart and no reload. Check that every label turned — the legend and the three schemes. Pick `Forms/LanguageFields` for the group that gets here.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			await canvas.findByRole("group", { name: "Thème" }),
		).toBeVisible()
		await expect(canvas.getByRole("radio", { name: "Clair" })).toBeVisible()
	},
})

export const Dark = meta.story({
	globals: { theme: "dark" },
	args: CHOSEN_DARK,
	parameters: {
		docs: {
			description: {
				story:
					"The panel read in the dark scheme, on a reader who chose it rather than left it to the machine. Check that the chosen option carries an edge as well as a fill — selection is never colour alone — and that the three icons stay legible on the dark surface. Pick `Default` for the light scheme.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("radio", { name: "Dark" })).toBeChecked()
	},
})
