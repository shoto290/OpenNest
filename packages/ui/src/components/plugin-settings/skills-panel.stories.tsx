import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	BOT_SKILLS,
	LONG_SKILL,
	SYSTEM_SKILL,
} from "@workspace/ui/components/plugin-settings/skills.fixtures"
import { SkillsPanel } from "@workspace/ui/components/plugin-settings/skills-panel"

const [CARRIED] = BOT_SKILLS

const meta = preview.meta({
	title: "AI/SkillsPanel",
	component: SkillsPanel,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"Every skill a bot carries: a name, when the bot should reach for it, and a tag on the ones that travel in every prompt. This is the resting state and the whole of it — taking a row hands the entire dialog to that skill, rail included, because a skill is a file somebody writes and it needs both the height and a summary of its own. The panel keeps nothing: it lists what it is given and reports which row was taken, so the surface above decides what an open skill looks like.",
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
	args: {
		skills: BOT_SKILLS,
		onOpen: fn(),
		onAdd: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A bundle with both marks in it. Check that the carried skill is the only one wearing the tag — that is the whole of what the list has to answer at a glance — and that a skill with no description keeps its row the same height as the others instead of shrinking. Taking a row reports the skill itself, never its name: renaming one moves nothing where it is kept.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /release-notes/ }))

		await expect(args.onOpen).toHaveBeenCalledWith(CARRIED)
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
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Add skill" }))

		await expect(args.onAdd).toHaveBeenCalledTimes(1)
	},
})

export const WithSystemSkill = meta.story({
	args: { skills: [SYSTEM_SKILL, ...BOT_SKILLS] },
	parameters: {
		docs: {
			description: {
				story:
					"A bundle the host wrote a skill into. Check that the system skill is listed like any other and tagged as its own, that a skill carried in every prompt wears both marks side by side without moving the chevron, and that taking its row reports it the same way — it opens, it is simply read rather than written. Pick `SkillEditor`'s `System` story for what opening it gives.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("System")).toBeVisible()

		await userEvent.click(canvas.getByRole("button", { name: /environment/ }))
		await expect(args.onOpen).toHaveBeenCalledWith(SYSTEM_SKILL)
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
