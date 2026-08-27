import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	botIdentityAvatars,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import { blotTransform } from "@workspace/ui/components/bot-avatar-blot"
import {
	BotIdentityFields,
	type BotIdentityFieldsProps,
} from "@workspace/ui/components/bot-identity-fields"
import type { BotIdentity } from "@workspace/ui/components/bot-settings"

const BOT_ID = "bot-7"

const IDENTITY: BotIdentity = { animal: "owl", blot: "blue" }

const FieldsHost = (props: BotIdentityFieldsProps) => {
	const [identity, setIdentity] = useState(props.identity)

	return (
		<BotIdentityFields
			{...props}
			identity={identity}
			onIdentityChange={(next) => {
				setIdentity(next)
				props.onIdentityChange(next)
			}}
		/>
	)
}

const chooseFile = (input: HTMLInputElement, file: File) => {
	const transfer = new DataTransfer()
	transfer.items.add(file)
	input.files = transfer.files
	input.dispatchEvent(new Event("change", { bubbles: true }))
}

const previewAvatar = (canvasElement: HTMLElement) => {
	const [preview] = botIdentityAvatars(canvasElement)
	if (!preview) throw new Error("The block is missing its preview")
	return preview
}

const pictureField = (canvasElement: HTMLElement) => {
	const [field] = slotsIn(canvasElement, "profile-picture-field")
	if (!field) throw new Error("The block is missing its picture field")
	return field
}

const drawnLabels = (canvasElement: HTMLElement) =>
	Array.from(canvasElement.querySelectorAll('svg[role="img"]')).map((svg) =>
		svg.getAttribute("aria-label"),
	)

const meta = preview.meta({
	title: "Forms/BotIdentityFields",
	component: BotIdentityFields,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"Everything a bot's face is made of, flat: what it looks like now, the eight animals the avatar engine draws, the eight ink blots that mark it plus the option that takes the blot off, and the round field that takes a picture and takes it back off. Nothing is behind a popover, a disclosure or a tab set — a reader in a bot's appearance sees every choice at once and compares them instead of opening one to find out. Each grid is a real radio group, so arrow keys move within it and the current choice is announced; the ring is the same answer for the eye. Every thumbnail wears the animal, the blot and the id currently in play, so both rows preview the actual outcome. Picking an animal or a blot takes the picture off, because the picture is what wins over both. The block never reads a file: it hands the host a `File` and waits for the picture to come back as `identity.image`. Only the preview is allowed to move, and only while `working` — the choices always rest.",
			},
		},
	},
	args: {
		identity: IDENTITY,
		seed: BOT_ID,
		onIdentityChange: fn(),
		onAvatarUpload: fn(),
	},
	argTypes: {
		working: { control: "boolean" },
	},
	render: (args) => <FieldsHost {...args} />,
	decorators: [
		(Story) => (
			<div className="w-[30rem] rounded-2xl border border-border bg-background p-6">
				<Story />
			</div>
		),
	],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: a bot that already picked an owl and a blue blot. Reach for it to check that the preview, both grids and the picture field stand at once with nothing to open first, that the two current choices are the checked ones, and that Tab walks the block in reading order.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("radio", { name: "Owl" })).toBeChecked()
		await expect(canvas.getByRole("radio", { name: "Blue" })).toBeChecked()
		await expect(canvas.getAllByRole("radio")).toHaveLength(17)
		await expect(
			canvas.getByRole("button", { name: "Add picture" }),
		).toBeVisible()
		await expect(canvas.queryByRole("dialog")).toBeNull()
		await expect(canvas.queryAllByRole("tab")).toHaveLength(0)
	},
})

export const PicksAnAnimal = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"What a new animal costs: the blot the bot already wears stays, and the picture goes — an animal cannot be seen under a photograph. Check that the preview and every blot swatch switch to the new animal at once.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("radio", { name: "Bear" }))

		await expect(args.onIdentityChange).toHaveBeenCalledWith({
			animal: "bear",
			blot: "blue",
		})
		await expect(canvas.getByRole("radio", { name: "Bear" })).toBeChecked()
	},
})

export const PicksABlot = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The other half of the same move: the animal stays, the tint behind it changes, and the picture goes with it. Check that every animal thumbnail repaints onto the new tint, so the grid keeps previewing the real outcome rather than the old one.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("radio", { name: "Red" }))

		await expect(args.onIdentityChange).toHaveBeenCalledWith({
			animal: "owl",
			blot: "red",
		})
		await expect(canvas.getByRole("radio", { name: "Red" })).toBeChecked()
	},
})

export const TakesTheBlotOff = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The ninth blot option is the absence of one. It sits in the same radio group rather than beside it as a clear button, because wearing no blot is a choice a bot makes, not an undo. Check that the emitted identity carries no blot at all and that the animal is then drawn on nothing.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getByRole("radio", { name: "No blot" }))

		await expect(args.onIdentityChange).toHaveBeenCalledWith({
			animal: "owl",
			blot: undefined,
		})
		await expect(
			slotsIn(previewAvatar(canvasElement), "bot-avatar-blot"),
		).toHaveLength(0)
	},
})

export const WithPicture = meta.story({
	args: { identity: { ...IDENTITY, image: UPLOADED_AVATAR_IMAGE } },
	parameters: {
		docs: {
			description: {
				story:
					"A bot wearing a picture. The preview shows the picture rather than the animal, while the grids keep showing what the bot would fall back to the moment a reader picks one — the choice under the photograph is never lost. Check that the preview draws no animal, and that the status line says the picture is what is on.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const preview = previewAvatar(canvasElement)

		await expect(preview.querySelector("img")).toHaveAttribute(
			"src",
			UPLOADED_AVATAR_IMAGE,
		)
		await expect(preview.querySelector("svg")).toBeNull()
		await expect(canvas.getByText("Uploaded image")).toBeVisible()
	},
})

export const RemovesThePicture = meta.story({
	args: { identity: { ...IDENTITY, image: UPLOADED_AVATAR_IMAGE } },
	parameters: {
		docs: {
			description: {
				story:
					"Taking the picture off, from the picture field itself rather than by picking an animal to overwrite it. The remove button reports the identity the bot already carries — the same animal, the same blot, no image — so the host clears the stored path on that one report and needs no command of its own. Check that the field falls back to the drawn face the moment the identity comes back without an image, and that the button goes with the picture.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const field = pictureField(canvasElement)

		await expect(field.querySelector("img")).toHaveAttribute(
			"src",
			UPLOADED_AVATAR_IMAGE,
		)

		await userEvent.click(
			canvas.getByRole("button", { name: "Remove picture" }),
		)

		await expect(args.onIdentityChange).toHaveBeenCalledWith({
			animal: "owl",
			blot: "blue",
		})
		await expect(field.querySelector("img")).toBeNull()
		await expect(field.querySelector('svg[role="img"]')).toHaveAttribute(
			"aria-label",
			"Bot avatar owl, idle",
		)
		await expect(
			canvas.queryByRole("button", { name: "Remove picture" }),
		).toBeNull()
	},
})

export const Working = meta.story({
	args: { working: true, workingKind: "writing" },
	parameters: {
		docs: {
			description: {
				story:
					"The block open on a bot mid-run. Only the preview performs the work, in the pose the host named; all seventeen choice avatars hold their idle frame, because a grid of working animals would say something about the bot that is not true. Check that exactly one avatar in here is doing anything.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [previewLabel, ...choices] = drawnLabels(canvasElement)

		await expect(previewLabel).toBe("Bot avatar owl, writing")
		await expect(choices.every((label) => label?.endsWith(", idle"))).toBe(true)
	},
})

export const Seeded = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The blot's shape comes from the bot's id and from nothing else, so every blot in the block — the preview's and all sixteen thumbnails' — wears the one shape this bot has always worn. Put it beside a block with no seed: the tints are the same and only the shape has turned.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const shapes = slotsIn(canvasElement, "bot-avatar-blot")

		await expect(shapes.length).toBeGreaterThan(0)
		for (const shape of shapes) {
			await expect(
				shape.getAttribute("transform")?.endsWith(blotTransform(BOT_ID)),
			).toBe(true)
		}
	},
})

export const ChoosesTheSameFileTwice = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A reader who picks a file, crops it outside the app and picks the very same file again. The field clears its input after every choice, so the second pick is a change like any other and the host hears about it — without that, the second attempt is silence and the reader presses again harder. Check that both picks reach the host.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		const input = canvas.getByLabelText<HTMLInputElement>("Avatar image file")
		const file = new File(["chosen"], "chosen.png", { type: "image/png" })

		chooseFile(input, file)
		await expect(args.onAvatarUpload).toHaveBeenCalledWith(file)
		await expect(input.value).toBe("")

		chooseFile(input, file)
		await expect(args.onAvatarUpload).toHaveBeenCalledTimes(2)
	},
})

export const DroppedAndPasted = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The two paths that never touch the file dialog: a file dropped on the zone, and a file pasted into it while it holds focus. Both hand the host the same `File`. The field is a real button, so it is a tab stop a paste can land in and Enter and Space open the dialog for a reader who has no file yet.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		const dropzone = canvas.getByRole("button", { name: "Add picture" })

		const dropped = new File(["dropped"], "dropped.png", { type: "image/png" })
		const transfer = new DataTransfer()
		transfer.items.add(dropped)
		dropzone.dispatchEvent(
			new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
		)
		await expect(args.onAvatarUpload).toHaveBeenCalledWith(dropped)

		const pasted = new File(["pasted"], "pasted.png", { type: "image/png" })
		const clipboard = new DataTransfer()
		clipboard.items.add(pasted)
		dropzone.focus()
		await expect(dropzone).toHaveFocus()
		dropzone.dispatchEvent(
			new ClipboardEvent("paste", { bubbles: true, clipboardData: clipboard }),
		)
		await expect(args.onAvatarUpload).toHaveBeenCalledWith(pasted)
	},
})
