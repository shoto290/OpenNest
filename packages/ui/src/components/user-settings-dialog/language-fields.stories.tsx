import { useState } from "react"
import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import {
	LanguageFields,
	type LanguageFieldsProps,
} from "@workspace/ui/components/user-settings-dialog/language-fields"
import {
	activateLanguage,
	DEFAULT_LANGUAGE,
	type Language,
} from "@workspace/ui/lib/i18n"

const LanguageHost = (props: LanguageFieldsProps) => {
	const [language, setLanguage] = useState(props.language)

	return (
		<LanguageFields
			{...props}
			language={language}
			onLanguageChange={(next: Language | null) => {
				setLanguage(next)
				activateLanguage(next ?? DEFAULT_LANGUAGE)
				props.onLanguageChange(next)
			}}
		/>
	)
}

const meta = preview.meta({
	title: "Settings/User/LanguageFields",
	component: LanguageFields,
	render: (args) => (
		<div className="w-[26rem]">
			<LanguageHost {...args} />
		</div>
	),
	beforeEach: () => () => activateLanguage(DEFAULT_LANGUAGE),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"What the app reads in, as a list one line to a language: the machine's own first, then every language this build ships a catalogue for. The list is the catalogues themselves, so there is no second list to fall out of step with them, and each language is written in its own — a reader lost in a language they cannot read still finds `English` or `Français`. The chosen line is filled and carries a tick against the leading edge, so the ticks line up down the list rather than sitting wherever a name happens to end. Only the machine row is a word of the interface, because following the machine is not a language: it turns with the rest of the panel. The group holds nothing — the choice goes straight to the host, which writes it down and hands back what the tick follows.",
			},
		},
	},
	args: {
		language: null,
		onLanguageChange: fn(),
	},
})

export const FollowingTheMachine = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"No language chosen, which is what a fresh record holds: the machine row heads the list and reads as the chosen one, and the app is read in whatever the machine is set to. Check that the three lines stack full width one under the other, that exactly one is chosen and that it is the machine's, never a language it happens to resolve to. Pick `Chosen` for the reader who picked one, `BackToTheMachine` for handing the choice back.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const languages = within(canvas.getByRole("group", { name: "Language" }))
		await expect(languages.getAllByRole("radio")).toHaveLength(3)
		await expect(languages.getByRole("radio", { name: "System" })).toBeChecked()

		const rows = slotsIn(canvasElement, "language-option")
		const tops = new Set(
			rows.map((row) => Math.round(row.getBoundingClientRect().top)),
		)
		await expect(tops.size).toBe(rows.length)

		await userEvent.click(languages.getByRole("radio", { name: "Français" }))
		await expect(args.onLanguageChange).toHaveBeenCalledWith("fr")
	},
})

export const Chosen = meta.story({
	args: { language: "fr" },
	parameters: {
		docs: {
			description: {
				story:
					"French chosen, so the interface is read in French while `English` stays `English` — a language names itself, whatever the reader is reading in. Check that the tick moved down to the French line, that the machine row turned into `Système` and reads as one of the interface's own words, and that the switch took hold with no restart and no reload. Pick `FollowingTheMachine` for the fresh record.",
			},
		},
	},
	beforeEach: () => activateLanguage("fr"),
	play: async ({ canvas }) => {
		const languages = within(
			await canvas.findByRole("group", { name: "Langue" }),
		)

		await expect(
			languages.getByRole("radio", { name: "Français" }),
		).toBeChecked()
		await expect(
			languages.getByRole("radio", { name: "English" }),
		).toBeVisible()
		await expect(
			languages.getByRole("radio", { name: "Système" }),
		).not.toBeChecked()
	},
})

export const BackToTheMachine = meta.story({
	args: { language: "fr" },
	beforeEach: () => activateLanguage("fr"),
	parameters: {
		docs: {
			description: {
				story:
					"A reader handing the choice back. Check that picking the machine row reports `null` rather than a language — the record forgets what it held instead of remembering the machine's own answer, so a machine set to something else later is followed. Pick `Chosen` for the state it starts from.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const languages = within(
			await canvas.findByRole("group", { name: "Langue" }),
		)

		await userEvent.click(languages.getByRole("radio", { name: "Système" }))
		await expect(args.onLanguageChange).toHaveBeenCalledWith(null)
		await expect(canvas.getByRole("radio", { name: "System" })).toBeChecked()
	},
})

export const Dark = meta.story({
	globals: { theme: "dark" },
	args: { language: "en" },
	parameters: {
		docs: {
			description: {
				story:
					"The list in the dark scheme. Check that the chosen line still reads as filled rather than as a hole in the panel, and that a line reached by keyboard carries a visible ring — selection and focus are two marks, never one. Pick `Chosen` for the light scheme.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const english = canvas.getByRole("radio", { name: "English" })
		await expect(english).toBeChecked()

		await userEvent.tab()
		await expect(english).toHaveFocus()
	},
})
