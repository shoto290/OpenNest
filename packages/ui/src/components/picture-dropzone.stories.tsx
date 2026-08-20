import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { PictureDropzone } from "@workspace/ui/components/picture-dropzone"
import { PICKED_PICTURE_FILE } from "@workspace/ui/components/picture-dropzone.fixtures"

const meta = preview.meta({
	title: "Forms/PictureDropzone",
	component: PictureDropzone,
	render: (args) => (
		<div className="w-80">
			<PictureDropzone {...args} />
		</div>
	),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The one way a picture gets into the app: dropped on the zone, pasted into it, or chosen through the picker it opens when pressed. Every settings surface that takes an image uses this one, so the three ways in behave the same wherever a picture is set. It is a button rather than a div with a handler, which is what makes Enter and Space open the picker and makes the zone a tab stop a paste can land in. It holds nothing and shows nothing it was given: the file goes straight to the host, which turns it into a URL and writes it back.",
			},
		},
	},
	args: { label: "Profile picture file", onPick: fn() },
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The resting zone. Check that the whole dashed area is the target — not just the words — that the copy names all three ways in, and that the file input behind it is named for the picture it takes rather than left as a bare `Choose file`. Pick `Focused` for the keyboard state.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const input = canvas.getByLabelText("Profile picture file")

		await expect(canvas.getByRole("button")).toBeVisible()
		await userEvent.upload(input, PICKED_PICTURE_FILE)
		await expect(args.onPick).toHaveBeenCalledWith(PICKED_PICTURE_FILE)
		await expect(input).toHaveValue("")
	},
})

export const States = meta.story({
	render: (args) => (
		<div className="flex w-[40rem] gap-4">
			<div className="flex-1" id="dropzone-hover">
				<PictureDropzone {...args} />
			</div>
			<div className="flex-1" id="dropzone-focus">
				<PictureDropzone {...args} />
			</div>
		</div>
	),
	parameters: {
		pseudo: {
			hover: "#dropzone-hover button",
			focusVisible: "#dropzone-focus button",
		},
		docs: {
			description: {
				story:
					"The zone under a pointer, then under a keyboard. Check that hover warms the dashed edge without moving anything, that the focus ring is visible against that same dashed edge, and that one Tab reaches the zone — the file input behind it is not a second stop. Focus is also the state a paste lands in, which is why the zone is a real control and not a styled region.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.tab()
		await expect(canvas.getAllByRole("button")[0]).toHaveFocus()
	},
})
