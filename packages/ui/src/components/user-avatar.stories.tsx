import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import { UserAvatar } from "@workspace/ui/components/user-avatar"

const NAME = "Ada Martin"

const meta = preview.meta({
	title: "Primitives/UserAvatar",
	component: UserAvatar,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The reader's own face, wherever the app shows it: the sidebar chip and the breadcrumb of their settings. One rendering for both, so a picture uploaded in the dialog is the picture the chip wears, and a reader with no picture wears the same initials in both. It draws and nothing else — no name beside it, no press target, no layout around it. `size` is the only thing a call site changes; the initials scale with it.",
			},
		},
	},
	args: { name: NAME },
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A reader who has filled in a name but uploaded no picture. Check that the initials are the first letter of the first two words, upper case whatever the name's own casing, and that the circle is fully round rather than a squared avatar. Pick `WithPicture` for the uploaded one.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("AM")).toBeVisible()
	},
})

export const WithPicture = meta.story({
	args: { image: UPLOADED_AVATAR_IMAGE },
	parameters: {
		docs: {
			description: {
				story:
					"A reader who uploaded a picture. Check that it wins over the initials, that it fills the circle by covering rather than stretching, and that it stays out of the accessible tree — the row around it already carries the name, and an avatar announcing it again would say it twice. Pick `Default` for the initials.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = slotsIn(canvasElement, "user-avatar")
		const image = avatar.querySelector("img")

		await expect(image).toHaveAttribute("aria-hidden", "true")
		await expect(getComputedStyle(image as Element).objectFit).toBe("cover")
	},
})

export const Empty = meta.story({
	args: { name: "" },
	parameters: {
		docs: {
			description: {
				story:
					"A reader who never filled a name in. Check that the circle reads `Y` for `You` rather than sitting blank — an avatar with nothing in it is indistinguishable from one that failed to load. Pick `Default` for the named reader.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Y")).toBeVisible()
	},
})

export const Sizes = meta.story({
	render: () => (
		<div className="flex items-center gap-4">
			<UserAvatar name={NAME} size={28} />
			<UserAvatar name={NAME} size={32} />
			<UserAvatar image={UPLOADED_AVATAR_IMAGE} name={NAME} size={64} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The two sizes in use — 28 in the sidebar chip, 32 in the settings breadcrumb — and a large one to show the rule holds. Check that the initials grow with the circle instead of staying pinned at one size and floating in a large one.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const heights = slotsIn(canvasElement, "user-avatar").map(
			(avatar) => avatar.getBoundingClientRect().height,
		)

		await expect(heights).toEqual([28, 32, 64])
	},
})
