import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import { PICKED_PICTURE_FILE } from "@workspace/ui/components/picture-dropzone.fixtures"
import {
	UserSettingsDialog,
	type UserSettingsDialogProps,
	type UserSettingsValue,
} from "@workspace/ui/components/user-settings-dialog"

const FILLED_USER: UserSettingsValue = {
	name: "Ada Martin",
	colorScheme: "system",
	palette: "amber",
}

const NEW_USER: UserSettingsValue = {
	name: "",
	colorScheme: "system",
	palette: "amber",
}

const PICTURED_USER: UserSettingsValue = {
	...FILLED_USER,
	image: UPLOADED_AVATAR_IMAGE,
	colorScheme: "dark",
	palette: "lavender",
}

const DialogHost = (props: UserSettingsDialogProps) => {
	const [value, setValue] = useState(props.value)
	const [language, setLanguage] = useState(props.language)
	const [open, setOpen] = useState(props.open)

	return (
		<UserSettingsDialog
			{...props}
			language={language}
			onClose={() => {
				setOpen(false)
				props.onClose()
			}}
			onLanguageChange={(next) => {
				setLanguage(next)
				props.onLanguageChange(next)
			}}
			onValueChange={(next) => {
				setValue(next)
				props.onValueChange(next)
			}}
			open={open}
			value={value}
		/>
	)
}

const dialogIn = async () => {
	const dialog = await screen.findByRole("dialog")
	await waitFor(() => expect(dialog).toBeVisible())
	return dialog
}

const meta = preview.meta({
	title: "Overlays/UserSettingsDialog",
	component: UserSettingsDialog,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"Everything a reader is to the app, in one overlay. A breadcrumb heads it with their own face — the same avatar the sidebar chip draws, so the dialog is visibly the one that chip opened — their name and the word Settings. Down the left is a rail of four groups: Profile, what the app calls them and the picture it shows; Appearance, how the app is painted; Notifications, what it tells them about; Language, the one it speaks. It opens on Profile every time. Same contract as a bot's settings and for the same reason: fully controlled, saving as you type, no draft, no debounce, no persistence — closing it is never a question. Two things do not travel through the value: the picture, whose file is handed to the host to store and write a URL back for, and the language, which travels as a prop of its own because the translation runtime is what the whole app reads from.",
			},
		},
	},
	args: {
		open: true,
		value: FILLED_USER,
		onClose: fn(),
		onValueChange: fn(),
		onPictureUpload: fn(),
		onPictureRemove: fn(),
		language: null,
		onLanguageChange: fn(),
	},
	render: (args) => <DialogHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The dialog as it opens on a reader who has filled their name in. Check that it lands on Profile with the display name in reach, that the breadcrumb wears their face and names them, and that typing emits a change immediately — nothing here batches or waits. Pick `Appearance` for the scheme and the palettes, `Notifications` for what the app tells them about, `LanguageTab` for the language the app is read in, `WithPicture` for the control that takes a picture, `Empty` for the reader who never filled anything in.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		await expect(dialog).toHaveAccessibleName("Ada Martin Settings")

		const profile = within(dialog).getByRole("tab", { name: "Profile" })
		await expect(profile).toHaveAttribute("aria-selected", "true")
		await expect(slotsIn(dialog, "user-avatar")).toHaveLength(1)

		const name = within(dialog).getByLabelText("Display name")
		await userEvent.type(name, "!")
		await expect(args.onValueChange).toHaveBeenCalledTimes(1)
		await expect(name).toHaveValue("Ada Martin!")
	},
})

export const Empty = meta.story({
	args: { value: NEW_USER },
	parameters: {
		docs: {
			description: {
				story:
					"A reader who has never filled anything in. Check that the breadcrumb reads `You` rather than a gap before the chevron, that the avatar falls back to that name's initial instead of a blank circle, that the picture control heads the group as a dashed circle with a person glyph and offers nothing to remove, and that the field itself stays empty with a placeholder — the fallback is what the app calls them, never a value written into the record. Pick `Default` for the named reader.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()

		await expect(dialog).toHaveAccessibleName("You Settings")
		await expect(
			within(dialog).getByRole("button", { name: "Add picture" }),
		).toBeVisible()
		await expect(
			within(dialog).queryByRole("button", { name: "Remove picture" }),
		).toBeNull()
		await expect(within(dialog).getByLabelText("Display name")).toHaveValue("")
	},
})

export const WithPicture = meta.story({
	args: { value: PICTURED_USER },
	parameters: {
		docs: {
			description: {
				story:
					"The round control that takes a picture, on a reader who already uploaded one. Check that it heads the Profile group above the display name and against the leading edge, that a picked file is handed to the host as a file and that the dialog changes nothing it holds — the picture only moves once the host writes a URL back. Remove is the same deal: it is emitted, never applied here. The same control takes a drop and a paste. Pick `Default` for the reader with no picture.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.upload(
			within(dialog).getByLabelText("Profile picture file"),
			PICKED_PICTURE_FILE,
		)
		await expect(args.onPictureUpload).toHaveBeenCalledWith(PICKED_PICTURE_FILE)

		await userEvent.click(
			within(dialog).getByRole("button", { name: "Remove picture" }),
		)
		await expect(args.onPictureRemove).toHaveBeenCalledTimes(1)
		await expect(args.onValueChange).not.toHaveBeenCalled()
	},
})

export const Appearance = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The second group: the three schemes, then the six palettes as tiles three to a row. Check that each tile is painted in the palette it offers rather than in the one the window is wearing, that the chosen one carries a tick as well as an edge, and that choosing a scheme or a palette writes the whole value back through `onValueChange`. Pick `Notifications` for the third group, `IconRail` for the width where the tiles drop to two a row.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		await userEvent.click(
			within(dialog).getByRole("tab", { name: "Appearance" }),
		)

		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Appearance",
		})
		await expect(slotsIn(panel, "palette-vignette")).toHaveLength(6)

		await userEvent.click(within(panel).getByRole("radio", { name: "Moss" }))
		await expect(args.onValueChange).toHaveBeenCalledWith(
			expect.objectContaining({ palette: "moss" }),
		)

		await userEvent.click(within(panel).getByRole("radio", { name: "Dark" }))
		await expect(args.onValueChange).toHaveBeenCalledWith(
			expect.objectContaining({ colorScheme: "dark" }),
		)
	},
})

export const Notifications = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The third group, on a record that holds no choice: all three switches on, which is what a reader who has never opened this tab is owed — a bot that asked something nobody heard waits forever. Check that flipping one writes the whole value back through `onValueChange` with that one event turned off and the name, the scheme and the palette exactly as they were. Pick `LanguageTab` for the group next door.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		await userEvent.click(
			within(dialog).getByRole("tab", { name: "Notifications" }),
		)

		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Notifications",
		})
		await userEvent.click(
			within(panel).getByRole("switch", { name: "A bot asks permission" }),
		)
		await expect(args.onValueChange).toHaveBeenCalledWith({
			...FILLED_USER,
			notifications: { question: true, permission: false, turn: true },
		})
	},
})

export const LanguageTab = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The last group, on a record holding no language: a list one line to a language, the machine row heading it as the chosen one and every language this build ships written in itself under it. Check that a language leaves the value alone and reports itself through `onLanguageChange` — the one field the dialog does not hold — and that handing the choice back to the machine reports `null` rather than the language the machine happens to be set to. Pick `Appearance` for the group next door.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		await userEvent.click(within(dialog).getByRole("tab", { name: "Language" }))

		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Language",
		})
		await expect(
			within(panel).getByRole("radio", { name: "System" }),
		).toBeChecked()

		await userEvent.click(
			within(panel).getByRole("radio", { name: "Français" }),
		)
		await expect(args.onLanguageChange).toHaveBeenCalledWith("fr")
		await expect(args.onValueChange).not.toHaveBeenCalled()

		await userEvent.click(within(panel).getByRole("radio", { name: "System" }))
		await expect(args.onLanguageChange).toHaveBeenLastCalledWith(null)
	},
})

export const IconRail = meta.story({
	render: (args) => (
		<div className="w-[34rem]">
			<DialogHost {...args} />
		</div>
	),
	globals: { viewport: { value: "mobile" } },
	parameters: {
		docs: {
			description: {
				story:
					"The dialog on a window too narrow for the rail's names — the state a laptop reaches once the dialog is capped to the viewport. Check that the rail keeps all four groups reachable and named to a screen reader, that hovering one names it in a tooltip, and that the palettes fall to two tiles a row so each still reads as a window rather than a sliver. Pick `Appearance` for the full-width grid.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		const appearance = within(dialog).getByRole("tab", { name: "Appearance" })

		await userEvent.click(appearance)
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Appearance",
		})

		const rows = new Set(
			slotsIn(panel, "palette-vignette").map((tile) =>
				Math.round(tile.getBoundingClientRect().top),
			),
		)
		await expect(rows.size).toBe(3)
	},
})
