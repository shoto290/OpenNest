import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import {
	BOT_SKILLS,
	LONG_SKILL,
} from "@workspace/ui/components/bot-settings-dialog/skills.fixtures"
import {
	SkillsPanel,
	type SkillsPanelProps,
} from "@workspace/ui/components/bot-settings-dialog/skills-panel"

const [CARRIED] = BOT_SKILLS

/** The panel keeps no skill of its own, so a story that lets a reader write holds
 * the bundle the writing produces — the way the app's own store does. */
const PanelHost = (props: SkillsPanelProps) => {
	const [skills, setSkills] = useState(props.skills)

	return (
		<SkillsPanel
			{...props}
			onChange={(id, draft) => {
				setSkills(
					skills.map((skill) =>
						skill.id === id ? { ...skill, ...draft } : skill,
					),
				)
				props.onChange(id, draft)
			}}
			onCreate={(draft, isPreloaded) => {
				setSkills([...skills, { ...draft, id: draft.name, isPreloaded }])
				props.onCreate(draft, isPreloaded)
			}}
			onDelete={(id) => {
				setSkills(skills.filter((skill) => skill.id !== id))
				props.onDelete(id)
			}}
			onPreloadedChange={(id, isPreloaded) => {
				setSkills(
					skills.map((skill) =>
						skill.id === id ? { ...skill, isPreloaded } : skill,
					),
				)
				props.onPreloadedChange(id, isPreloaded)
			}}
			skills={skills}
		/>
	)
}

const meta = preview.meta({
	title: "AI/SkillsPanel",
	component: SkillsPanel,
	parameters: {
		layout: "fullscreen",
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				component:
					"Every skill a bot carries, and the one being written. The list is the resting state — a name, when the bot should reach for it, and a tag on the ones that travel in every prompt — and opening a row hands the whole panel to that skill, because a skill is markdown somebody writes and it needs the height. The panel holds only which skill is open and the draft of the one that does not exist yet: everything else is reported to the surface, which owns the writing, and every call is addressed by the skill's id rather than its name, since renaming a skill moves nothing on the disk. The destructive red on its own tint is the token's known contrast gap, flagged for review rather than worked around here.",
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
	render: (args) => <PanelHost {...args} />,
	args: {
		skills: BOT_SKILLS,
		onCreate: fn(),
		onChange: fn(),
		onPreloadedChange: fn(),
		onDelete: fn(),
	},
	argTypes: {
		// Read once, as the panel mounts, so they are a story's args rather than knobs.
		defaultOpenSkillId: { control: false },
		defaultAdding: { control: false },
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A bundle with both marks in it. Check that the carried skill is the only one wearing the tag — that is the whole of what the list has to answer at a glance — and that a skill with no description keeps its row the same height as the others instead of shrinking.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /release-notes/ }))

		await expect(canvas.getByLabelText("Name")).toHaveValue(CARRIED.name)
	},
})

export const Empty = meta.story({
	args: { skills: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A bot nobody has written a skill for. Reach for this over `Default` to check the one state that has to both say so and offer a way out of it: the sentence explains what a skill is before asking for one, and the button opens the same blank editor the list's own does.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Add skill" }))

		await expect(canvas.getByLabelText("Name")).toHaveValue("")
	},
})

export const LongContent = meta.story({
	args: { skills: [LONG_SKILL, ...BOT_SKILLS] },
	parameters: {
		docs: {
			description: {
				story:
					"A skill whose name and description both run past the row. Check that each truncates on its own line rather than wrapping the row taller, and that the tag and the chevron hold their place at the end of the row whatever the name does.",
			},
		},
	},
})

export const WithNewSkill = meta.story({
	args: { defaultAdding: true },
	parameters: {
		docs: {
			description: {
				story:
					"The panel mounted straight on the blank editor, which is where the add button lands. The preload card is here too: whether a skill travels in every prompt is part of writing one, not a second visit once it is on the disk. Writing it reports the draft and the mark together, once, and returns to the list — the skill only appears there because the surface answered with it, already wearing its tag.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Name"), "Release checklist")
		await userEvent.click(canvas.getByRole("switch"))
		await userEvent.click(canvas.getByRole("button", { name: "Add skill" }))

		await expect(args.onCreate).toHaveBeenCalledWith(
			{ name: "release-checklist", description: "", body: "" },
			true,
		)
		await expect(
			canvas.getByRole("button", { name: /release-checklist/ }),
		).toHaveTextContent("Preloaded")
	},
})

export const WithPreloadToggled = meta.story({
	args: { defaultOpenSkillId: BOT_SKILLS[1].id },
	parameters: {
		docs: {
			description: {
				story:
					"The panel mounted on a skill the bot does not carry, so the mark can be turned on and followed back to the list. Reach for this to check the one change that costs tokens on every turn afterwards: the switch reports the skill's id and the new mark, and the row it belongs to comes back wearing the tag.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("switch"))
		await expect(args.onPreloadedChange).toHaveBeenCalledWith(
			BOT_SKILLS[1].id,
			true,
		)

		await userEvent.click(canvas.getByRole("button", { name: "All skills" }))
		await expect(
			canvas.getByRole("button", { name: /commit-style/ }),
		).toHaveTextContent("Preloaded")
	},
})
