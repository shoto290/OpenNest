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
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import {
	type BotModelOption,
	BotSettingsPanel,
	type BotSettingsPanelProps,
	type BotSettingsValue,
} from "@workspace/ui/components/bot-settings-panel"

const UPLOADED_IMAGE =
	"data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA5NiA5Nic+PHJlY3Qgd2lkdGg9Jzk2JyBoZWlnaHQ9Jzk2JyBmaWxsPScjZThhMzNkJy8+PGNpcmNsZSBjeD0nNDgnIGN5PSczOCcgcj0nMTYnIGZpbGw9JyNmZmY3ZTgnLz48cmVjdCB4PScyMCcgeT0nNjAnIHdpZHRoPSc1NicgaGVpZ2h0PSc0MCcgcng9JzIwJyBmaWxsPScjZmZmN2U4Jy8+PC9zdmc+"

const MODELS: BotModelOption[] = [
	{ label: "Claude Sonnet 4.5", value: "sonnet-4-5" },
	{ label: "Claude Opus 4.1", value: "opus-4-1" },
	{ label: "Claude Haiku 4.5", value: "haiku-4-5" },
]

const FILLED_BOT: BotSettingsValue = {
	identity: { animal: "owl", pose: "curious" },
	name: "Nest Keeper",
	title: "Repository archivist",
	description:
		"Reads the monorepo before it answers. Keeps the design system and the app on their own sides of the line, and says so when a change crosses it.",
	instructions:
		"You are the Nest Keeper.\n\nEvery visual belongs to packages/ui. The app composes, it never draws.\n\nBefore proposing a component, search the package for one that already does the job. Answer with the file you would touch, then the change.",
	model: "sonnet-4-5",
	workingDirectory: "/Users/ada/Projects/opennest",
}

const NEW_BOT: BotSettingsValue = {
	identity: { animal: "cat", pose: "idle" },
	name: "",
	title: "",
	description: "",
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
		<PanelHost {...props} label="Bot settings — working" working />
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
					"The settings column that sits to the right of the chat and holds everything a bot is: its avatar, its words, the model behind it and the folder it works in. It is fully controlled and saves as you type — every keystroke emits `onValueChange` with the whole value, and the panel owns no draft, no debounce and no persistence. `Delete bot` opens a confirmation this panel owns, and `confirmingDelete` lets a host stand that same dialog up from anywhere else it offers to delete a bot. It is open whenever it is mounted: there is no rail to fold to, and closing it is the host unmounting the column, so a reader who put it away gets the whole width back rather than a strip of it. The avatar picker is a popover with two tabs: `Bot` picks one of the eight animals and one of the eight identity poses, `Upload` takes a dropped, pasted or browsed file and hands the host a `File`. An identity pose is a still character: the avatar holds one frame and only moves while `working` is set, which is the single thing animation is allowed to mean here. An uploaded picture cannot act at all, so its liveness moves to an activity dot.",
			},
		},
	},
	args: {
		value: FILLED_BOT,
		models: MODELS,
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
					"The nominal case: a bot that has been filled in and used. Reach for it to check the reading order — avatar, Name, Title, Description, Instructions, model, folder, delete — and that Instructions gets visibly more room than Description. Typing anywhere emits a change immediately; nothing here batches or waits.",
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
					"The bot wears a picture instead of an animal. Check that the image renders static and round, and that the dot at its corner is grey while the bot is idle — the animal carries liveness in its pose, a photograph has to borrow it. Pick `Working` for the same avatar with the dot lit.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"Nest Keeper is idle",
		)
	},
})

export const Working = meta.story({
	args: { value: UPLOADED_BOT, working: true },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while a run is in flight on a bot that wears a picture: the activity dot turns green and pulses, and a screen reader is told the bot is working. The dot exists only because a photograph cannot move — pick `StillUntilWorking` for what the same flag does to an animal identity.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"Nest Keeper is working",
		)
	},
})

export const StillUntilWorking = meta.story({
	render: (args) => <StillnessPair {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The product rule, side by side: one identity, one pose, and motion as the only difference. Every one of the eight poses has an expression and a blink cadence, so a pose left animating would never sit still — the avatar therefore animates when `working` is set and holds a single frame when it is not. Open this in Storybook to check it by eye: the left avatar must not blink, breathe or change expression while the right one does. The test browser forces reduced motion, so both halves are frozen under `test:storybook` and the play can only guard the wiring, not the movement.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("img", { name: "Bot avatar owl, curious" }),
		).toBeVisible()
		await expect(
			canvas.getByRole("img", { name: "Bot avatar owl, working" }),
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

export const PickerBotTab = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The first tab of the avatar popover: the eight animals the avatar engine draws, then the eight poses that give the bot its resting temperament. Each grid is a real radio group, so arrow keys move within it and the current choice is announced; the ring is the same answer for the eye. Every pose thumbnail wears the animal currently chosen, so the row previews the actual outcome.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const picker = await openPicker(canvas, userEvent)

		await expect(
			within(picker).getByRole("radio", { name: "Owl" }),
		).toBeChecked()
		await expect(
			within(picker).getByRole("radio", { name: "Curious" }),
		).toBeChecked()
		await expect(within(picker).getAllByRole("radio")).toHaveLength(16)
	},
})

export const PickerUploadTab = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The second tab: a dropzone that takes a drag, a drop or a paste, and a browse button for readers who want a file dialog. The panel never reads the file — it hands the host a `File` and waits for the picture to come back as `value.identity.image`. Check that the dashed edge lights up on drag over and that the browse button is reachable by Tab, since paste only works once focus is inside the zone.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const picker = await openPicker(canvas, userEvent)

		await userEvent.click(within(picker).getByRole("tab", { name: "Upload" }))
		await expect(
			within(picker).getByText("Drag, drop, or paste an image"),
		).toBeVisible()
		await expect(
			within(picker).getByRole("button", { name: "Browse files" }),
		).toBeVisible()
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
