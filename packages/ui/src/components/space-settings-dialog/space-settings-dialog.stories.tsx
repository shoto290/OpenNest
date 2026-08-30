import { useState } from "react"
import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { BLOT_TINTS } from "@workspace/ui/components/bot-settings"
import { SPACE_ENVIRONMENT } from "@workspace/ui/components/environment.fixtures"
import { BOT_COMMITS } from "@workspace/ui/components/plugin-settings/history.fixtures"
import { BOT_SKILLS } from "@workspace/ui/components/plugin-settings/skills.fixtures"
import {
	SpaceSettingsDialog,
	type SpaceSettingsDialogProps,
	type SpaceSettingsValue,
} from "@workspace/ui/components/space-settings-dialog"

const FILLED_SPACE: SpaceSettingsValue = {
	name: "Release desk",
	colour: "blue",
}

const DialogHost = (props: SpaceSettingsDialogProps) => {
	const [value, setValue] = useState(props.value)
	const [open, setOpen] = useState(props.open)

	return (
		<SpaceSettingsDialog
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
	title: "Settings/Space/SpaceSettingsDialog",
	component: SpaceSettingsDialog,
	parameters: {
		layout: "fullscreen",
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				component:
					"Everything a space is, in one overlay — the reader's own settings, told about a work area instead of a person. A breadcrumb heads it with the space's tint dot and its name, so the dialog is visibly the one that space opened. Down the left is a rail of four entries: the space itself, what it is called and the tint it wears; its environment, the variables every bot in it starts with; its skills, the plugin every bot in it reads before answering; its history, everything ever written into that plugin. Below a separator sits the danger zone, set apart in destructive tone exactly as a bot's settings sets it apart, because a space takes its bots with it. It opens on the space every time. Same contract as a bot's settings and for the same reason: fully controlled, saving as you type, no draft, no debounce — closing it is never a question, except while a skill is half written.",
			},
		},
	},
	args: {
		open: true,
		value: FILLED_SPACE,
		onClose: fn(),
		onValueChange: fn(),
		environment: SPACE_ENVIRONMENT,
		onEnvironmentSet: fn(),
		onEnvironmentDelete: fn(),
		skills: BOT_SKILLS,
		onSkillCreate: fn(),
		onSkillChange: fn(),
		onSkillPreloadedChange: fn(),
		onSkillDelete: fn(),
		history: {
			commits: BOT_COMMITS,
			onLoadDiff: fn(),
			onRevert: fn(),
		},
		onDelete: fn(),
	},
	render: (args) => <DialogHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The dialog as it opens on a named space. Check that it lands on the space entry with the name in reach, that the breadcrumb wears the space's tint as a dot and names it, that typing reports the edited name with the tint unchanged, and that picking a swatch reports the tint with the name unchanged. Pick `Skills` and `History` for the space's own plugin, `Danger` for the way out, `LastSpace` for the space that cannot be deleted.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		await expect(dialog).toHaveAccessibleName("Release desk Settings")
		await expect(slotsIn(dialog, "space-tint")).toHaveLength(
			BLOT_TINTS.length + 2,
		)

		const space = within(dialog).getByRole("tab", { name: "Space" })
		await expect(space).toHaveAttribute("aria-selected", "true")

		const name = within(dialog).getByLabelText("Name")
		await userEvent.type(name, "!")
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk!",
			colour: "blue",
		})

		await userEvent.click(within(dialog).getByRole("radio", { name: "Pink" }))
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk!",
			colour: "pink",
		})
	},
})

export const Environment = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The variables the space hands to every bot in it — the same panel a bot's settings draws, read at space scope, so each name is the space's own and every one of them can be replaced or removed here. A name a bot redefines is still listed, marked as served from the bot, because the space is where it was written even when it is not the value that runs. Check that adding a name reports it, and that the panel never shows a value back.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(
			within(dialog).getByRole("tab", { name: "Environment" }),
		)
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Environment",
		})

		await expect(within(panel).getByText("ATLAS_TOKEN")).toBeVisible()
		await expect(within(panel).getByText("Overridden by Bot")).toBeVisible()

		await userEvent.click(
			within(panel).getByRole("button", { name: "Add variable" }),
		)
		const write = await screen.findByRole("dialog", {
			name: "Add a variable",
		})

		await userEvent.type(within(write).getByLabelText("Name"), "RELEASE_DESK")
		await userEvent.type(within(write).getByLabelText("Value"), "sk-live")
		await userEvent.click(
			within(write).getByRole("button", { name: "Save variable" }),
		)

		await expect(args.onEnvironmentSet).toHaveBeenCalledWith({
			name: "RELEASE_DESK",
			value: "sk-live",
		})
	},
})

export const Skills = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The skills of the space's own plugin — the same panel a bot's settings draws, on the plugin every bot in the space reads before it answers. Check that opening one swaps the whole body for the editor, and that the way back restores the rail on the space entry, as the reader's own dialog does after the same trip.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(within(dialog).getByRole("tab", { name: "Skills" }))
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Skills",
		})

		await userEvent.click(
			within(panel).getByRole("button", { name: /release-notes/ }),
		)
		const back = within(dialog).getByRole("button", { name: "All skills" })
		await expect(back).toBeVisible()

		await userEvent.click(back)
		await expect(
			within(dialog).getByRole("tab", { name: "Skills" }),
		).toBeVisible()
	},
})

export const History = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Everything ever written into the space's plugin, newest first, whoever wrote it. Check that a change the reader made is signed You and one a bot made is signed generically — the space holds many bots, so the entry names none of them — and that asking for the changes of an entry calls back for its diff.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(within(dialog).getByRole("tab", { name: "History" }))
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "History",
		})

		await expect(within(panel).getAllByText("You").length).toBeGreaterThan(0)
		await expect(within(panel).getAllByText("A bot").length).toBeGreaterThan(0)

		await userEvent.click(
			within(panel).getAllByRole("button", { name: "Show changes" })[0],
		)
		await expect(args.history.onLoadDiff).toHaveBeenCalled()
	},
})

export const Danger = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The last rail entry, held apart from the other three by a separator and painted in the destructive tone so it is never picked by accident. Check that the entry is reachable by keyboard like any other, that the question names the space rather than asking `Are you sure?`, and that `onDelete` fires once the reader presses through — the dialog deletes nothing itself and does not close on its own. Pick `LastSpace` for the space that refuses to go.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(
			within(dialog).getByRole("tab", { name: "Danger zone" }),
		)
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Danger zone",
		})

		await userEvent.click(
			within(panel).getByRole("button", { name: "Delete space" }),
		)
		const popup = await screen.findByRole("alertdialog")
		await expect(popup).toHaveTextContent("Delete Release desk?")

		await userEvent.click(
			within(popup).getByRole("button", { name: "Delete space" }),
		)
		await expect(args.onDelete).toHaveBeenCalledTimes(1)
	},
})

export const LastSpace = meta.story({
	args: { isDeletable: false },
	parameters: {
		docs: {
			description: {
				story:
					"The only space the reader owns, where deletion is refused. Check that the entry is still there and the control still shown, disabled rather than hidden, that the block states why in place of the consequence, and that pressing it opens no question and reports nothing — the refusal is a fact about the app, not an error the reader made. Pick `Danger` for the space that can go.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(
			within(dialog).getByRole("tab", { name: "Danger zone" }),
		)
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Danger zone",
		})
		const trigger = within(panel).getByRole("button", { name: "Delete space" })

		await expect(trigger).toBeDisabled()

		fireEvent.click(trigger)
		await expect(screen.queryByRole("alertdialog")).toBe(null)
		await expect(args.onDelete).not.toHaveBeenCalled()
	},
})
