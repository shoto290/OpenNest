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
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import {
	type BotModelOption,
	BotSettingsDialog,
	type BotSettingsDialogProps,
	type BotSettingsValue,
} from "@workspace/ui/components/bot-settings-dialog"

/** The id the store minted for the bot this dialog edits. It is what the shape of
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
	identity: { ...FILLED_BOT.identity, image: UPLOADED_AVATAR_IMAGE },
}

/** The dialog keeps no draft and has no open state of its own, so a story holds
 * both — the value it edits and whether it stands. */
const DialogHost = (props: BotSettingsDialogProps) => {
	const [value, setValue] = useState(props.value)
	const [open, setOpen] = useState(props.open)

	return (
		<BotSettingsDialog
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

const railIn = (dialog: HTMLElement) => {
	const [rail] = slotsIn(dialog, "bot-settings-rail")
	if (!rail) throw new Error("The dialog is missing its rail")
	return rail
}

const avatarIn = (dialog: HTMLElement) => {
	const [avatar] = slotsIn(dialog, "bot-identity-avatar")
	if (!avatar) throw new Error("The breadcrumb is missing its avatar")
	return avatar
}

/** Long enough for a tooltip to have opened if one were wired, so a story can show
 * that none is. */
const TOOLTIP_SETTLES_MS = 300

const settle = () =>
	new Promise((resolve) => setTimeout(resolve, TOOLTIP_SETTLES_MS))

const openTab = async (
	dialog: HTMLElement,
	name: string,
	user: ReturnType<typeof userEvent.setup>,
) => {
	await user.click(within(dialog).getByRole("tab", { name }))
	return await within(dialog).findByRole("tabpanel", { name })
}

const meta = preview.meta({
	title: "Overlays/BotSettingsDialog",
	component: BotSettingsDialog,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"Everything a bot is, in one overlay. A breadcrumb heads it with the bot's avatar, its name and the word Settings, so a reader who opened it from a roster of twelve knows which one they are editing on every tab. Down the left is a rail of groups — General, Appearance, Instructions, Runtime, then a separator and Danger zone in destructive tone, last because it is the one action that cannot be undone. It opens on General every time. It is fully controlled and saves as you type: every keystroke emits `onValueChange` with the whole value, and the dialog owns no draft, no debounce and no persistence — closing it is never a question, because there is nothing unsaved to lose. The breadcrumb and the rail hold still and only the open group scrolls, so the rail is where a reader left it after a long scroll through the animals. Below 42rem of content the rail drops to its icons, each one still named to a screen reader and named on hover and focus with a tooltip.",
			},
		},
	},
	args: {
		open: true,
		value: FILLED_BOT,
		models: MODELS,
		seed: BOT_ID,
		onClose: fn(),
		onValueChange: fn(),
		onAvatarUpload: fn(),
		onBrowseWorkingDirectory: fn(),
		onDelete: fn(),
	},
	argTypes: {
		working: { control: "boolean" },
	},
	render: (args) => <DialogHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The dialog as it opens on a bot that has been filled in and used. Check that it lands on General with the name and the title in reach, that the breadcrumb names the bot beside its avatar, and that the dialog announces itself as that bot's settings rather than as `Settings`. Typing emits a change immediately; nothing here batches or waits. Pick `Rail` for the way between the groups.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		await expect(dialog).toHaveAccessibleName("Nest Keeper Settings")

		const general = within(dialog).getByRole("tab", { name: "General" })
		await expect(general).toHaveAttribute("aria-selected", "true")

		const name = within(dialog).getByLabelText("Name")
		await userEvent.type(name, "!")
		await expect(args.onValueChange).toHaveBeenCalledTimes(1)
		await expect(name).toHaveValue("Nest Keeper!")
	},
})

export const Rail = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The five groups and the way between them. Check the order — General, Appearance, Instructions, Runtime, then a rule and Danger zone alone below it, the only item in destructive tone. One tab stop reaches the rail and the arrow keys walk it, so a keyboard reader crosses the whole dialog in two stops rather than five. Walking is not opening: focus moves with the arrows and the group opens on Enter, so nobody drags a grid of animals or a model list past on their way to the one they wanted. No item carries a tooltip at this width — its name is already on the screen. Pick `IconRail` for the width where the name leaves it. The breadcrumb is unchanged whichever group is open: it names the bot, not the group.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		const rail = railIn(dialog)
		const names = within(rail)
			.getAllByRole("tab")
			.map((tab) => tab.textContent)
		await expect(names).toEqual([
			"General",
			"Appearance",
			"Instructions",
			"Runtime",
			"Danger zone",
		])

		const appearance = within(rail).getByRole("tab", { name: "Appearance" })
		within(rail).getByRole("tab", { name: "General" }).focus()
		await userEvent.keyboard("{ArrowDown}")
		await expect(appearance).toHaveFocus()
		await expect(appearance).toHaveAttribute("aria-selected", "false")

		await userEvent.keyboard("{Enter}")
		await waitFor(() =>
			expect(appearance).toHaveAttribute("aria-selected", "true"),
		)
		await expect(
			within(dialog).getByText("Nest Keeper", { selector: "span" }),
		).toBeVisible()

		await userEvent.hover(appearance)
		await settle()
		await expect(document.body.querySelector('[role="tooltip"]')).toBe(null)
		await expect(appearance).not.toHaveAttribute("aria-describedby")
	},
})

export const Appearance = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The whole of a bot's face, flat: the preview, the eight animals, the nine blot choices and the zone that takes a picture. Nothing is folded away behind a popover — the tab is the picker. Check that choosing an animal writes the whole value back through `onValueChange` and that the preview follows it immediately.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await openTab(dialog, "Appearance", userEvent)

		await expect(slotsIn(panel, "bot-identity-fields")).toHaveLength(1)

		await userEvent.click(within(panel).getByRole("radio", { name: "Rabbit" }))
		await expect(args.onValueChange).toHaveBeenCalledWith(
			expect.objectContaining({
				identity: expect.objectContaining({ animal: "rabbit" }),
			}),
		)
	},
})

export const Instructions = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The system prompt, in one control that takes the whole tab. Check that it grows to the dialog's height rather than sitting as an eight-row box with dead space under it, that it does not resize by hand, and that a prompt longer than the box scrolls inside the control while the rail and the breadcrumb hold still.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await openTab(dialog, "Instructions", userEvent)
		const field = within(panel).getByLabelText("Instructions")

		await expect(
			panel.getBoundingClientRect().height -
				field.getBoundingClientRect().height,
		).toBeLessThan(80)

		await userEvent.type(field, ".")
		await expect(args.onValueChange).toHaveBeenCalledTimes(1)
	},
})

export const Runtime = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"What the bot runs on: the model out of the list the host supplies, and the folder it works in. Both are pickers — neither is something a reader can type correctly. Check that the folder row shows the whole path or truncates it from the end, that pressing it hands the ask to the host rather than opening anything itself, and that the model list marks the one in use.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await openTab(dialog, "Runtime", userEvent)

		await userEvent.click(
			within(panel).getByRole("combobox", { name: /Model/ }),
		)
		await userEvent.click(
			await screen.findByRole("option", { name: "Claude Opus 4.1" }),
		)
		await expect(args.onValueChange).toHaveBeenCalledWith(
			expect.objectContaining({ model: "opus-4-1" }),
		)

		await userEvent.click(
			within(panel).getByRole("button", { name: /Working directory/ }),
		)
		await expect(args.onBrowseWorkingDirectory).toHaveBeenCalledTimes(1)
	},
})

export const DangerZone = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The last group, and the only one that cannot be undone. Check that the destructive action is never one press away: it opens a confirmation naming the bot and saying what leaves with it, that Cancel closes that confirmation and changes nothing, and that only the second press reports the deletion. The group carries its tone in the rail as well as in the panel, so a reader never lands here by accident. The destructive red on its own tint is the token's known contrast gap, flagged for review rather than worked around here.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const panel = await openTab(dialog, "Danger zone", userEvent)

		await userEvent.click(
			within(panel).getByRole("button", { name: "Delete bot" }),
		)
		const confirmation = await screen.findByRole("alertdialog")
		await expect(confirmation).toHaveTextContent("Delete Nest Keeper?")

		await userEvent.click(
			within(confirmation).getByRole("button", { name: "Cancel" }),
		)
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onDelete).not.toHaveBeenCalled()

		await userEvent.click(
			within(panel).getByRole("button", { name: "Delete bot" }),
		)
		const reopened = await screen.findByRole("alertdialog")
		await userEvent.click(
			within(reopened).getByRole("button", { name: "Delete bot" }),
		)
		await expect(args.onDelete).toHaveBeenCalledTimes(1)
	},
})

export const IconRail = meta.story({
	args: { className: "w-[26rem]" },
	parameters: {
		docs: {
			description: {
				story:
					"The dialog on a window too narrow to hold the rail and a panel side by side. The rail drops to its icons and the panel keeps the width it needs. Check that every item is still a named tab to a screen reader — the name leaves the screen, never the accessible tree — and that hovering or focusing one says it in a tooltip beside it. The tooltip exists at this width and no other: it replaces the label rather than repeating it. Pick `Rail` for the width where the names are on the screen.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()
		const rail = railIn(dialog)
		const runtime = within(rail).getByRole("tab", { name: "Runtime" })

		await expect(runtime.getBoundingClientRect().width).toBeLessThan(64)

		runtime.focus()
		await waitFor(() =>
			expect(document.body.querySelector('[role="tooltip"]')).toHaveTextContent(
				"Runtime",
			),
		)
	},
})

export const ScrollsOneTab = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A group taller than the dialog — the animals, the blots and the picture zone together. Check that the panel is the one thing that moves: the breadcrumb stays on the bot's name and the rail stays where the reader left it, so the way out of a long group is never a scroll back up. The dialog itself never scrolls.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		const rail = railIn(dialog)
		const panel = await openTab(dialog, "Appearance", userEvent)
		const railTop = rail.getBoundingClientRect().top

		await expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight)
		await expect(dialog.scrollHeight).toBe(dialog.clientHeight)

		panel.scrollTop = panel.scrollHeight
		await waitFor(() => expect(rail.getBoundingClientRect().top).toBe(railTop))
		await expect(
			within(dialog).getByRole("tab", { name: "Appearance" }),
		).toBeVisible()
	},
})

export const Empty = meta.story({
	args: { value: NEW_BOT },
	parameters: {
		docs: {
			description: {
				story:
					"A bot that has just been created and holds nothing yet. Check that the breadcrumb still names something rather than opening on a blank, that every field falls back to a placeholder saying what belongs there, and that the model reads `Choose a model` and the folder `Choose a folder` rather than empty boxes.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		await expect(dialog).toHaveAccessibleName("Untitled bot Settings")
		await expect(within(dialog).getByLabelText("Name")).toHaveValue("")

		const panel = await openTab(dialog, "Runtime", userEvent)
		await expect(
			within(panel).getByRole("button", { name: /Working directory/ }),
		).toHaveTextContent("Choose a folder")
	},
})

export const Working = meta.story({
	args: { value: UPLOADED_BOT, working: true, workingKind: "writing" },
	parameters: {
		docs: {
			description: {
				story:
					"The bot is mid-run while its settings are open. Check that the breadcrumb avatar is the same face the roster row is showing, doing the same thing — a picture cannot act, so its liveness is the dot at its corner. Editing a bot never stops it.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()
		const avatar = avatarIn(dialog)

		await expect(avatar.querySelector("img")).toHaveAttribute(
			"src",
			UPLOADED_AVATAR_IMAGE,
		)
		await expect(
			avatar.querySelector('[data-slot="bot-activity-dot"]'),
		).not.toBeNull()
	},
})

export const Closing = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The three ways out — Escape, the backdrop and the corner affordance — and none of them asks a question. Every keystroke was already reported, so there is nothing unsaved to warn about. Check that Escape closes the dialog and reports it once, and that nothing is confirmed on the way.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		await dialogIn()

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null))
		await expect(args.onClose).toHaveBeenCalledTimes(1)
		await expect(screen.queryByRole("alertdialog")).toBe(null)
	},
})
