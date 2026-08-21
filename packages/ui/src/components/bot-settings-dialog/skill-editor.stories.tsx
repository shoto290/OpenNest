import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import type { BotSkillDraft } from "@workspace/ui/components/bot-settings"
import {
	SkillEditor,
	type SkillEditorProps,
} from "@workspace/ui/components/bot-settings-dialog/skill-editor"
import {
	BOT_SKILLS,
	LONG_SKILL,
} from "@workspace/ui/components/bot-settings-dialog/skills.fixtures"

const [CARRIED] = BOT_SKILLS

const BLANK: BotSkillDraft = { name: "", description: "", body: "" }

/** The editor keeps no draft and no mark of its own, so a story that lets a reader
 * type or press holds both. */
const EditorHost = (props: SkillEditorProps) => {
	const [draft, setDraft] = useState(props.draft)
	const [isPreloaded, setPreloaded] = useState(props.isPreloaded)

	return (
		<SkillEditor
			{...props}
			draft={draft}
			isPreloaded={isPreloaded}
			onDraftChange={(next) => {
				setDraft(next)
				props.onDraftChange(next)
			}}
			onPreloadedChange={
				props.onPreloadedChange &&
				((next) => {
					setPreloaded(next)
					props.onPreloadedChange?.(next)
				})
			}
		/>
	)
}

const meta = preview.meta({
	title: "AI/SkillEditor",
	component: SkillEditor,
	parameters: {
		layout: "fullscreen",
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				component:
					"One skill of a bot's, whole: what it is called, when the bot should reach for it, whether it travels in the prompt, and the markdown it is written in. The preload mark comes before the body and wears a card of its own — it is the one field here that costs something on every turn, and the sentence beside it says so, read after the label rather than in place of it. The body takes whatever height is left, the way the instructions field does, because a skill is markdown somebody writes and a four-line box is not where that happens. A skill that already exists is written as it is typed and carries a delete behind a question; one that does not exist yet carries a button instead, because a directory is only made once. The destructive red on its own tint is the token's known contrast gap, flagged for review rather than worked around here.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex h-[28rem] w-[36rem] flex-col gap-4 p-5">
				<Story />
			</div>
		),
	],
	render: (args) => <EditorHost {...args} />,
	args: {
		draft: CARRIED,
		isPreloaded: CARRIED.isPreloaded,
		onDraftChange: fn(),
		onBack: fn(),
		onPreloadedChange: fn(),
		onDelete: fn(),
	},
	argTypes: {
		// Read once, as the editor mounts, so it is a story's arg rather than a knob.
		defaultConfirming: { control: false },
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A skill that already exists, carried in every prompt. Nothing here waits on a save — every keystroke reports the whole draft, addressed by the id the editor was opened on, which is why renaming it is safe. Check that the body field grows into the height the card and the fields above it leave, and that the preload card keeps its own height while it does.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Name"), " Weekly")

		await expect(args.onDraftChange).toHaveBeenLastCalledWith({
			...CARRIED,
			name: `${CARRIED.name}-weekly`,
		})
	},
})

export const Empty = meta.story({
	args: {
		draft: BLANK,
		isPreloaded: undefined,
		onPreloadedChange: undefined,
		onDelete: undefined,
		onCreate: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A skill that does not exist yet. Reach for this over `Default` to review what a reader is asked for before anything is written: no preload card, because the mark is set on its own once the skill is there, and no delete, because there is nothing on the disk to take away. The button is the whole difference — a directory is made once — and it stays disabled until the skill is named.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const create = canvas.getByRole("button", { name: "Add skill" })

		await expect(create).toBeDisabled()
		await userEvent.type(canvas.getByLabelText("Name"), "Release notes")
		await expect(create).toBeEnabled()

		await userEvent.click(create)
		await expect(args.onCreate).toHaveBeenCalledTimes(1)
	},
})

export const WithTypedName = meta.story({
	args: { draft: BLANK, onCreate: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"A skill's name is an identifier, not a title: the format takes lowercase letters, numbers and hyphens and refuses the file outright for anything else. So the field writes what a reader types into the only shape it may take, rather than letting them find out from a skill that never loads — typing `Release Notes` leaves `release-notes`, and the hint under the field says why before it happens. What the bot reads to decide when to reach for a skill is the description, which takes any words at all.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const name = canvas.getByLabelText("Name")

		await userEvent.type(name, "Release Notes!")
		await expect(name).toHaveValue("release-notes-")
	},
})

export const ZeroValue = meta.story({
	args: {
		draft: { name: "review-checklist", description: "", body: "" },
		isPreloaded: false,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A real skill with an empty description and an empty body — not the same as `Empty`, which is a skill that was never written. Check that both fields fall back to their placeholder rather than collapsing, and that the preload card reads as genuinely off rather than as unset.",
			},
		},
	},
})

export const LongContent = meta.story({
	args: { draft: LONG_SKILL, isPreloaded: LONG_SKILL.isPreloaded },
	parameters: {
		docs: {
			description: {
				story:
					"A runbook long enough to overflow its field several times over, with a name and a description that both wrap. Check that only the body scrolls — the name, the description and the preload card must stay put, because the sentence about the cost is the one thing a reader must not have to scroll to.",
			},
		},
	},
})

export const WithConfirmation = meta.story({
	args: { defaultConfirming: true },
	parameters: {
		docs: {
			description: {
				story:
					"The delete, mounted with its question already up. It names the skill and states what goes with it before anything is reported. Check that cancelling leaves the editor exactly as it was and reports nothing, and that accepting fires `onDelete` once.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await screen.findByRole("alertdialog")
		await waitFor(() => expect(popup).toBeVisible())

		await expect(popup).toHaveTextContent(`Delete ${CARRIED.name}?`)
		await userEvent.click(
			within(popup).getByRole("button", { name: "Delete skill" }),
		)

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onDelete).toHaveBeenCalledTimes(1)
	},
})
