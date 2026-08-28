import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	PICKED_PICTURE_FILE,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"
import { ProfilePictureField } from "@workspace/ui/components/profile-picture-field"
import { PICTURE_FIELD_SIZE } from "@workspace/ui/components/settings-styles"
import { UserAvatar } from "@workspace/ui/components/user-avatar"

const PICTURE = (
	<UserAvatar image={UPLOADED_AVATAR_IMAGE} size={PICTURE_FIELD_SIZE} />
)

const GLYPH = (
	<Icons.User aria-hidden="true" className="size-6 text-muted-foreground" />
)

const EMPTY = { isPlaceholder: true, onRemove: undefined, preview: GLYPH }

const DRAWN_FACE = (
	<BotIdentityAvatar
		animal="owl"
		blot="blue"
		seed="bot-7"
		size={PICTURE_FIELD_SIZE}
	/>
)

const meta = preview.meta({
	title: "Forms/ProfilePictureField",
	component: ProfilePictureField,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A picture, as the control that sets it: the round target the settings dialogs head their first group with, whether the picture belongs to the reader or to a bot. Pressing it opens the picker, and a file dropped on it or pasted into it goes the same way — the same drag, paste and browse, wearing the shape the picture will actually have. What sits inside the circle is the host's to draw and arrives as `preview`, which is what lets one field serve a reader with no picture but a person glyph, and a bot with no picture but the face its engine draws. It holds nothing and names nothing: every label arrives as a prop, and the picked file and the removal both go straight to the host, which stores the picture and writes the URL back.",
			},
		},
	},
	args: {
		preview: PICTURE,
		fileLabel: "Profile picture file",
		pickLabel: "Change picture",
		removeLabel: "Remove picture",
		onPick: fn(),
		onRemove: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A reader who already wears a picture. Check that the picture fills the circle rather than sitting in a box inside it, that the remove button sits on the bottom trailing corner without covering the face, and that both press targets emit and change nothing on screen — the picture only moves once the host writes back. Pick `Empty` for the reader with no picture, `Drawn` for a bot's, `WithoutRemove` for the surface that cannot take one off.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const input = canvas.getByLabelText("Profile picture file")

		await expect(
			canvas.getByRole("button", { name: "Change picture" }),
		).toBeVisible()
		await userEvent.upload(input, PICKED_PICTURE_FILE)
		await expect(args.onPick).toHaveBeenCalledWith(PICKED_PICTURE_FILE)
		await expect(input).toHaveValue("")

		await userEvent.click(
			canvas.getByRole("button", { name: "Remove picture" }),
		)
		await expect(args.onRemove).toHaveBeenCalledTimes(1)
	},
})

export const Empty = meta.story({
	args: { ...EMPTY, pickLabel: "Add picture" },
	parameters: {
		docs: {
			description: {
				story:
					"The reader who has never uploaded one. Check that the circle is a dashed outline carrying a person glyph rather than initials — this control is about the picture, not the name — that it names itself `Add picture` rather than `Change picture`, and that no remove button is reachable, by pointer or by Tab: there is nothing to take off. Pick `Default` for the worn picture.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(
			canvas.getByRole("button", { name: "Add picture" }),
		).toBeVisible()
		await expect(
			canvas.queryByRole("button", { name: "Remove picture" }),
		).toBeNull()

		await userEvent.upload(
			canvas.getByLabelText("Profile picture file"),
			PICKED_PICTURE_FILE,
		)
		await expect(args.onPick).toHaveBeenCalledWith(PICKED_PICTURE_FILE)
	},
})

export const Drawn = meta.story({
	args: {
		preview: DRAWN_FACE,
		fileLabel: "Avatar image file",
		pickLabel: "Add picture",
		onRemove: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The same field heading a bot's settings. A bot with no picture is never a blank — it has a face the engine draws — so the host hands that face as the preview and leaves the edge solid rather than dashed. Check that the shape, the size and the corner are the reader's own, and that nothing but the circle's contents tells the two hosts apart.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("button", { name: "Add picture" }),
		).toBeVisible()
		await expect(canvas.getByLabelText("Avatar image file")).toBeVisible()
	},
})

export const WithoutRemove = meta.story({
	args: { onRemove: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A host that takes pictures but never takes them off — no remove handler given. Check that the corner is clean rather than carrying a button that does nothing, and that replacing still works through the control itself. Pick `Default` when the host can clear the picture.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.queryByRole("button", { name: "Remove picture" }),
		).toBeNull()
	},
})

export const States = meta.story({
	render: (args) => (
		<div className="flex items-center gap-8">
			<div id="picture-empty-hover">
				<ProfilePictureField {...args} {...EMPTY} />
			</div>
			<div id="picture-empty-focus">
				<ProfilePictureField {...args} {...EMPTY} />
			</div>
			<div id="picture-filled-hover">
				<ProfilePictureField {...args} />
			</div>
			<div id="picture-remove-hover">
				<ProfilePictureField {...args} />
			</div>
		</div>
	),
	parameters: {
		pseudo: {
			hover: [
				"#picture-empty-hover button",
				"#picture-filled-hover button",
				"#picture-remove-hover button:last-of-type",
			],
			focusVisible: "#picture-empty-focus button",
		},
		docs: {
			description: {
				story:
					"The empty circle under a pointer and under a keyboard, then the worn picture and its remove button under a pointer. Check that hover warms the edge without moving anything, that the focus ring reads against the dashed edge, and that the ring on the round control is not clipped by its own overflow. Two Tabs cover a worn picture — the control, then remove — and the file input behind them is not a stop of its own.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.tab()
		await expect(canvas.getAllByRole("button")[0]).toHaveFocus()
	},
})
