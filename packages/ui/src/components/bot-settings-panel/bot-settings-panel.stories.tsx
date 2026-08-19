import { useState } from "react"
import {
	expect,
	fn,
	screen,
	type userEvent,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	type BotModelOption,
	BotSettingsPanel,
	type BotSettingsPanelProps,
	type BotSettingsValue,
} from "@workspace/ui/components/bot-settings-panel"

const UPLOADED_IMAGE =
	"data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA5NiA5Nic+PHJlY3Qgd2lkdGg9Jzk2JyBoZWlnaHQ9Jzk2JyBmaWxsPScjZThhMzNkJy8+PGNpcmNsZSBjeD0nNDgnIGN5PSczOCcgcj0nMTYnIGZpbGw9JyNmZmY3ZTgnLz48cmVjdCB4PScyMCcgeT0nNjAnIHdpZHRoPSc1NicgaGVpZ2h0PSc0MCcgcng9JzIwJyBmaWxsPScjZmZmN2U4Jy8+PC9zdmc+"

/** The id the store minted for the bot this panel edits. It is what the shape of
 * its blot is derived from, and the only thing in here a reader cannot change. */
const BOT_ID = "bot-7"

const MODELS: BotModelOption[] = [
	{ label: "Claude Sonnet 4.5", value: "sonnet-4-5" },
	{ label: "Claude Opus 4.1", value: "opus-4-1" },
	{ label: "Claude Haiku 4.5", value: "haiku-4-5" },
]

const FILLED_BOT: BotSettingsValue = {
	identity: { animal: "owl", blot: "sky" },
	name: "Nest Keeper",
	title: "Repository archivist",
	instructions:
		"You are the Nest Keeper.\n\nEvery visual belongs to packages/ui. The app composes, it never draws.\n\nBefore proposing a component, search the package for one that already does the job. Answer with the file you would touch, then the change.",
	model: "sonnet-4-5",
	workingDirectory: "/Users/ada/Projects/opennest",
}

const NEW_BOT: BotSettingsValue = {
	identity: { animal: "cat" },
	name: "",
	title: "",
	instructions: "",
	model: "",
	workingDirectory: "",
}

const UPLOADED_BOT: BotSettingsValue = {
	...FILLED_BOT,
	identity: { ...FILLED_BOT.identity, image: UPLOADED_IMAGE },
}

/** The panel keeps no draft, so a story has to hold the value it edits. */
const PanelHost = (props: BotSettingsPanelProps) => {
	const [value, setValue] = useState(props.value)

	return (
		<BotSettingsPanel
			{...props}
			onValueChange={(next) => {
				setValue(next)
				props.onValueChange(next)
			}}
			value={value}
		/>
	)
}

/** Two panels on one identity, so the only difference left between them is motion. */
const StillnessPair = (props: BotSettingsPanelProps) => (
	<div className="flex h-full gap-px bg-border">
		<PanelHost {...props} label="Bot settings — idle" />
		<PanelHost
			{...props}
			label="Bot settings — working"
			working
			workingKind="writing"
		/>
	</div>
)

const openPicker = async (
	canvas: ReturnType<typeof within>,
	user: ReturnType<typeof userEvent.setup>,
) => {
	await user.click(canvas.getByRole("button", { name: /^Change avatar/ }))

	const picker = await screen.findByRole("dialog")
	await waitFor(() => expect(picker).toBeVisible())

	return picker
}

const meta = preview.meta({
	title: "AI/BotSettingsPanel",
	component: BotSettingsPanel,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The settings column that sits to the right of the chat and holds everything a bot is: its avatar, its words, the model behind it and the folder it works in. It is fully controlled and saves as you type — every keystroke emits `onValueChange` with the whole value, and the panel owns no draft, no debounce and no persistence. `Delete bot` opens a confirmation this panel owns, and `confirmingDelete` lets a host stand that same dialog up from anywhere else it offers to delete a bot. It is open whenever it is mounted: there is no rail to fold to, and closing it is the host unmounting the column, so a reader who put it away gets the whole width back rather than a strip of it. The avatar picker is a popover with two tabs: `Bot` picks one of the eight animals and one of the eight ink blots — or no blot at all — and `Upload` takes a dropped, pasted or browsed file and hands the host a `File`. A bot at rest is a still character: the avatar holds one idle frame and only moves while `working` is set, which is the single thing animation is allowed to mean here. An uploaded picture cannot act at all, so its liveness moves to an activity dot.",
			},
		},
	},
	args: {
		value: FILLED_BOT,
		models: MODELS,
		seed: BOT_ID,
		onValueChange: fn(),
		onAvatarUpload: fn(),
		onBrowseWorkingDirectory: fn(),
		onDelete: fn(),
		onClose: fn(),
	},
	argTypes: {
		working: { control: "boolean" },
	},
	render: (args) => <PanelHost {...args} />,
	decorators: [
		(Story) => (
			<div className="flex h-[46rem] justify-end bg-background">
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
					"The nominal case: a bot that has been filled in and used. Reach for it to check the reading order — avatar, Name, Title, Instructions, model, folder, delete — and that Instructions, the one field written at length, is the one field with room to write it in. Typing anywhere emits a change immediately; nothing here batches or waits.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const name = canvas.getByLabelText("Name")

		await userEvent.type(name, "!")
		await expect(args.onValueChange).toHaveBeenCalledTimes(1)
		await expect(name).toHaveValue("Nest Keeper!")
	},
})

export const Empty = meta.story({
	args: { value: NEW_BOT },
	parameters: {
		docs: {
			description: {
				story:
					"A bot that has just been created and holds nothing yet. Reach for it to check that every field falls back to a placeholder that says what belongs there, that the model reads `Choose a model` rather than an empty box, and that the delete action is still reachable — an unfinished bot is the one most likely to be thrown away.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByLabelText("Name")).toHaveValue("")
		await expect(
			canvas.getByRole("button", { name: /Working directory/ }),
		).toHaveTextContent("Choose a folder")
	},
})

export const WithUploadedAvatar = meta.story({
	args: { value: UPLOADED_BOT },
	parameters: {
		docs: {
			description: {
				story:
					"The bot wears a picture instead of an animal. Check that the image renders static and round, that no animal is drawn behind or beside it, and that nothing marks activity while the bot is idle — the dot says work, and this bot is not working. It is the same avatar the roster row and the replies draw, at this column's size. Pick `Working` for the same picture with the dot lit.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"Nest Keeper is idle",
		)

		const avatar = avatarIn(canvasElement)
		await expect(avatar.querySelector("img")).toHaveAttribute(
			"src",
			UPLOADED_IMAGE,
		)
		await expect(avatar.querySelector("svg")).toBeNull()
		await expect(
			avatar.querySelector('[data-slot="bot-activity-dot"]'),
		).toBeNull()
	},
})

export const Working = meta.story({
	args: { value: UPLOADED_BOT, working: true },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while a run is in flight on a bot that wears a picture: the picture stays — it is the bot, and swapping it for an animal that can move would be showing the reader somebody else — so the work is said with the dot at its corner, and a screen reader is told in words. The dot exists only because a photograph cannot act. Pick `StillUntilWorking` for what the same flag does to an animal identity.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"Nest Keeper is working",
		)

		const avatar = avatarIn(canvasElement)
		await expect(avatar.querySelector("img")).toHaveAttribute(
			"src",
			UPLOADED_IMAGE,
		)
		await expect(avatar.querySelector("svg")).toBeNull()
		await expect(
			avatar.querySelector('[data-slot="bot-activity-dot"]'),
		).not.toBeNull()
	},
})

export const StillUntilWorking = meta.story({
	render: (args) => <StillnessPair {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The product rule, side by side: one identity and motion as the only difference. Every engine state has an expression and a blink cadence, so an avatar left animating would never sit still — it therefore animates when `working` is set and holds one idle frame when it is not. The animal and its blot are the bot's either way: the working half performs the work with the owl its reader chose, in the pose the work is named after, never with the animal the engine draws when nobody names one. Open this in Storybook to check the movement by eye: the left avatar must not blink, breathe or change expression while the right one does. The test browser forces reduced motion, so both halves are frozen under `test:storybook` and the play guards the wiring instead.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("img", { name: "Bot avatar owl, idle" }),
		).toBeVisible()
		// The bot's own owl, doing the work the host named — not the animal the engine
		// draws when nobody names one.
		await expect(
			canvas.getByRole("img", { name: "Bot avatar owl, writing" }),
		).toBeVisible()
	},
})

export const Closing = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The way out. The panel has no closed state of its own — it does not fold to a rail, and it keeps no avatar anywhere outside itself — so the close button reports the ask and the host unmounts the column. Reach for this to check that closing is one control, that it is reachable by Tab before the fields, and that the panel changes nothing on its own when it is pressed. The reader gets the width back because the column is gone, not because it shrank.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const close = canvas.getByRole("button", { name: "Close Bot settings" })

		await userEvent.click(close)
		await expect(args.onClose).toHaveBeenCalledTimes(1)
		// Still whole: what the reader sees is the host's to take away.
		await expect(canvas.getByLabelText("Name")).toBeVisible()
	},
})

/** The one avatar the column draws, whatever it draws inside it. */
const avatarIn = (canvasElement: HTMLElement) => {
	const avatar = canvasElement.querySelector<HTMLElement>(
		'[data-slot="bot-identity-avatar"]',
	)
	if (!avatar) throw new Error("The panel is missing its avatar")
	return avatar
}

const fieldsIn = (canvasElement: HTMLElement) => {
	const fields = canvasElement.querySelector<HTMLElement>(
		'[data-slot="bot-settings-fields"]',
	)
	if (!fields) throw new Error("The panel is missing its fields")
	return fields
}

const panelIn = (canvasElement: HTMLElement) => {
	const panel = canvasElement.querySelector<HTMLElement>(
		'[data-slot="bot-settings-panel"]',
	)
	if (!panel) throw new Error("The panel is not mounted")
	return panel
}

export const RoomToSpare = meta.story({
	decorators: [
		(Story) => (
			<div className="flex h-[64rem] justify-end bg-background">
				<Story />
			</div>
		),
	],
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A column taller than the fields, which is what a tall window gives it. Reach for this to check the two things a settings column must not do on a big screen: stop short of the bottom, and leave the delete action floating in the middle of the panel under the last field. The panel takes the whole height it is given and the destructive action sits against the bottom edge, one padding away, with the slack above it — where a reader looking for the way to get rid of a bot expects it. Pick `ScrollsToTheDelete` for the same panel with less room than it needs.",
			},
		},
	},
	play: async ({ canvasElement, canvas }) => {
		const panel = panelIn(canvasElement)
		const fields = fieldsIn(canvasElement)
		const column = panel.parentElement
		if (!column) throw new Error("The panel has no column to fill")

		await expect(panel.getBoundingClientRect().height).toBe(
			column.getBoundingClientRect().height,
		)
		await expect(fields.scrollHeight).toBeLessThanOrEqual(fields.clientHeight)

		const remove = canvas.getByRole("button", { name: "Delete bot" })
		const gap =
			panel.getBoundingClientRect().bottom -
			remove.getBoundingClientRect().bottom
		// One padding, and nothing more: the action is at the edge rather than under
		// the last field it happens to follow.
		await expect(gap).toBeGreaterThan(0)
		await expect(gap).toBeLessThanOrEqual(24)
	},
})

export const ScrollsToTheDelete = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The same panel in a column shorter than its fields, which is what a laptop gives it. The fields scroll inside the panel — the panel itself never grows past the height it was given, so nothing is left under the bottom of the window with no way to reach it — and the delete action scrolls with them rather than being pinned over the content. Check that the destructive action is out of view until the reader goes looking for it, and that it is reachable when they do. Pick `RoomToSpare` for the tall column where it rests at the bottom.",
			},
		},
	},
	play: async ({ canvasElement, canvas }) => {
		const panel = panelIn(canvasElement)
		const fields = fieldsIn(canvasElement)
		const remove = canvas.getByRole("button", { name: "Delete bot" })

		await expect(fields.scrollHeight).toBeGreaterThan(fields.clientHeight)
		await expect(remove.getBoundingClientRect().bottom).toBeGreaterThan(
			panel.getBoundingClientRect().bottom,
		)

		fields.scrollTop = fields.scrollHeight
		await waitFor(async () =>
			expect(remove.getBoundingClientRect().bottom).toBeLessThanOrEqual(
				panel.getBoundingClientRect().bottom,
			),
		)
	},
})

export const PickerBotTab = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The first tab of the avatar popover: the eight animals the avatar engine draws, then the eight ink blots that mark the bot, plus the option that takes the blot off. Each grid is a real radio group, so arrow keys move within it and the current choice is announced; the ring is the same answer for the eye. Every thumbnail wears the animal and the blot currently chosen, so both rows preview the actual outcome.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const picker = await openPicker(canvas, userEvent)

		await expect(
			within(picker).getByRole("radio", { name: "Owl" }),
		).toBeChecked()
		await expect(
			within(picker).getByRole("radio", { name: "Sky" }),
		).toBeChecked()
		await expect(within(picker).getAllByRole("radio")).toHaveLength(17)
	},
})

export const PickerUploadTab = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The second tab: one dashed zone that is the whole control. A reader holding a file drops or pastes it; a reader who has to go find one presses the same target and gets the file dialog — there is no separate browse button to aim at, and nothing inside the zone that is a target of its own. It is a real button, so Enter and Space open the dialog too and it is the tab stop a paste needs focus in. The panel never reads the file: it hands the host a `File` and waits for the picture to come back as `value.identity.image`. Check that the dashed edge lights up on drag over and that focus lands on the zone itself.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const picker = await openPicker(canvas, userEvent)
		await userEvent.click(within(picker).getByRole("tab", { name: "Upload" }))

		const dropzone = within(picker).getByRole("button", {
			name: /Drag, drop or paste an image/,
		})
		await expect(dropzone).toBeVisible()
		await expect(
			within(picker).queryByRole("button", { name: "Browse files" }),
		).toBeNull()

		// A native file dialog is not something a test can dismiss, so the input's own
		// click is caught and stopped here. What is under test is that the zone reaches
		// for it — by pointer, and by both keys a button answers to.
		const asked = fn()
		within(picker)
			.getByLabelText("Avatar image file")
			.addEventListener("click", (event) => {
				event.preventDefault()
				asked()
			})

		await userEvent.click(dropzone)
		await expect(asked).toHaveBeenCalledTimes(1)

		dropzone.focus()
		await expect(dropzone).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(asked).toHaveBeenCalledTimes(2)
		await userEvent.keyboard(" ")
		await expect(asked).toHaveBeenCalledTimes(3)
	},
})

export const PickerUploadDrop = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The two paths that do not touch the file dialog at all, which is what makes the zone worth pressing rather than aiming past: a file dropped on it, and a file pasted into it while it holds focus. Both hand the host the same `File` and neither is changed by the zone having become the trigger. Reach for this after touching the dropzone; pick `PickerUploadTab` for the dialog it opens.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const picker = await openPicker(canvas, userEvent)
		await userEvent.click(within(picker).getByRole("tab", { name: "Upload" }))
		const dropzone = within(picker).getByRole("button", {
			name: /Drag, drop or paste an image/,
		})

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
		dropzone.dispatchEvent(
			new ClipboardEvent("paste", { bubbles: true, clipboardData: clipboard }),
		)
		await expect(args.onAvatarUpload).toHaveBeenCalledWith(pasted)
	},
})

export const DeleteAskedFromElsewhere = meta.story({
	args: { confirmingDelete: true, onConfirmingDeleteChange: fn() },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The same confirmation, stood up by the host rather than by the button beside it: a roster row's context menu, a shortcut, anything that asks to delete a bot from outside this column lands here instead of building a dialog of its own. Reach for it to check that the dialog is open on arrival, that it still names the bot, and that dismissing it reports the change rather than closing behind the host's back — `confirmingDelete` is controlled, so the panel never closes it on its own. Pick `DeleteConfirmation` for the path that starts at the button.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const dialog = await screen.findByRole("alertdialog")
		await waitFor(() => expect(dialog).toBeVisible())
		await expect(
			within(dialog).getByRole("heading", { name: "Delete Nest Keeper?" }),
		).toBeVisible()

		await userEvent.click(
			within(dialog).getByRole("button", { name: "Cancel" }),
		)
		await expect(args.onConfirmingDeleteChange).toHaveBeenCalledWith(false)
		await expect(args.onDelete).not.toHaveBeenCalled()
		await expect(canvas.getByLabelText("Name")).toBeVisible()
	},
})

export const DeleteConfirmation = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Reach for this to check the one destructive path. `Delete bot` never deletes on its own — it opens an alert dialog that names the bot and says what goes with it. Focus moves into the dialog and returns to the button on Escape, so the action cannot be completed by a stray Enter.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Delete bot" }))

		const dialog = await screen.findByRole("alertdialog")
		await waitFor(() => expect(dialog).toBeVisible())

		await expect(
			within(dialog).getByRole("heading", { name: "Delete Nest Keeper?" }),
		).toBeVisible()
		await expect(
			within(dialog).getByRole("button", { name: "Cancel" }),
		).toBeVisible()
	},
})

export const BlotShape = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The preview wears the blot shape this bot actually wears everywhere else, because the panel is handed the bot's id and derives it from that. Open the picker and the eight tint swatches wear it too: a reader choosing a tint is choosing a tint, and must see it laid down on their own bot's shape rather than on a stock one. Change the animal, change the tint, change the name — the shape does not move, because none of those is what it is derived from. Check that the preview and the roster row beside it in `WorkspaceShell → SettingsOpen` are the same mark.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const preview = canvas.getByRole("button", { name: /^Change avatar/ })
		const [worn] = slotsIn(preview, "bot-avatar-blot")

		const picker = await openPicker(canvas, userEvent)
		for (const swatch of slotsIn(picker, "bot-avatar-blot")) {
			await expect(swatch.getAttribute("transform")).toBe(
				worn.getAttribute("transform"),
			)
		}
	},
})
