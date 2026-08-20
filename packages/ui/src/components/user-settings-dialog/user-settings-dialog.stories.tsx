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

/** The dialog keeps no draft and has no open state of its own, so a story holds
 * both — the value it edits and whether it stands. */
const DialogHost = (props: UserSettingsDialogProps) => {
	const [value, setValue] = useState(props.value)
	const [open, setOpen] = useState(props.open)

	return (
		<UserSettingsDialog
			{...props}
			onClose={() => {
				setOpen(false)
				props.onClose()
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
					"Everything a reader is to the app, in one overlay. A breadcrumb heads it with their own face — the same avatar the sidebar chip draws, so the dialog is visibly the one that chip opened — their name and the word Settings. Down the left is a rail of two groups: Profile, what the app calls them and the picture it shows, then Appearance, the language the app speaks and how it is painted. It opens on Profile every time. Same contract as a bot's settings and for the same reason: fully controlled, saving as you type, no draft, no debounce, no persistence — closing it is never a question. Two things do not travel through the value: the picture, whose file is handed to the host to store and write a URL back for, and the language, which lives in the translation runtime the whole app reads from.",
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
		onLanguageChange: fn(),
	},
	render: (args) => <DialogHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The dialog as it opens on a reader who has filled their name in. Check that it lands on Profile with the display name in reach, that the breadcrumb wears their face and names them, and that typing emits a change immediately — nothing here batches or waits. Pick `Appearance` for the scheme and the palettes, `WithPicture` for the control that takes a picture, `Empty` for the reader who never filled anything in.",
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
					"The second group: the languages this build ships, then the three schemes, then the six palettes as tiles three to a row. Check that each tile is painted in the palette it offers rather than in the one the window is wearing, that the chosen one carries a tick as well as an edge, that choosing a scheme or a palette writes the whole value back through `onValueChange`, and that a language leaves that value alone and reports itself through `onLanguageChange` — the one field the dialog does not hold. Pick `IconRail` for the width where the tiles drop to two a row.",
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

		await userEvent.click(
			within(panel).getByRole("radio", { name: "Français" }),
		)
		await expect(args.onLanguageChange).toHaveBeenCalledWith("fr")
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
					"The dialog on a window too narrow for the rail's names — the state a laptop reaches once the dialog is capped to the viewport. Check that the rail keeps both groups reachable and named to a screen reader, that hovering one names it in a tooltip, and that the palettes fall to two tiles a row so each still reads as a window rather than a sliver. Pick `Appearance` for the full-width grid.",
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
