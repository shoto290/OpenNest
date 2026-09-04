import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { MissionRow } from "@workspace/ui/components/mission-row"
import {
	FAILED_MISSION,
	MISSIONS_READ_AT,
	READY_MISSION,
	WAITING_HUMAN_MISSION,
	WORKING_MISSION,
} from "@workspace/ui/components/missions.fixtures"
import { ROUTINES_PANEL_WIDTH } from "@workspace/ui/components/routines-panel"

const LONG_OBJECTIVE =
	"Rewrite the changelog parser so it reads every package of the workspace in one pass"

const dotIn = (canvasElement: HTMLElement) =>
	canvasElement.querySelector<HTMLElement>('[data-slot="bot-badge-dot"]')

const meta = preview.meta({
	title: "Conversation/Missions/MissionRow",
	component: MissionRow,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One mission of a conversation, as it reads in the activity panel: what the mission is for on one line, then its ticket, its tools and how long it has been open on a second line that truncates rather than wraps. The row carries no control of its own — the whole row is the way into the mission — and a mission that needs reading gets a badge dot at its end, with the same words a screen reader hears. Reach for it inside `RoutinesPanel`; on its own it is only useful to check one row's states.",
			},
		},
	},
	args: {
		...WORKING_MISSION,
		now: MISSIONS_READ_AT,
		onOpen: fn(),
	},
	render: (args) => (
		<ul className="flex flex-col gap-2" style={{ width: ROUTINES_PANEL_WIDTH }}>
			<MissionRow {...args} />
		</ul>
	),
})

export const Working = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A mission its bot is working on, and the same appearance a mission waiting for its bot gets: nothing is asked of the reader, so no badge is drawn. Check that the ticket, the tools and the time read as one line, and that the row reports the mission it belongs to when it is pressed.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(dotIn(canvasElement)).toBeNull()
		await expect(canvas.getByText("OPE-42")).toBeVisible()
		await expect(canvas.getByText("Read, Write")).toBeVisible()
		await expect(canvas.getByText("1 hour ago")).toBeVisible()

		await userEvent.click(canvas.getByText(WORKING_MISSION.objective))
		await expect(args.onOpen).toHaveBeenCalled()
	},
})

export const WaitingForAHuman = meta.story({
	args: WAITING_HUMAN_MISSION,
	parameters: {
		docs: {
			description: {
				story:
					"A mission stopped on a question only a person can answer. Check that the attention dot is drawn at the end of the row, that it names the wait for a screen reader rather than leaving colour to carry it alone, and that it keeps its size while the objective truncates beside it.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(dotIn(canvasElement)).toHaveAttribute(
			"data-badge",
			"attention",
		)
		await expect(canvas.getByText("Waiting for a human")).toBeInTheDocument()
	},
})

export const ReadyToMerge = meta.story({
	args: READY_MISSION,
	parameters: {
		docs: {
			description: {
				story:
					"A mission whose work is done and waiting to be merged. Check that the done dot replaces the attention one rather than adding to it, and that the row still opens the mission rather than offering to merge it here.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(dotIn(canvasElement)).toHaveAttribute("data-badge", "done")
		await expect(canvas.getByText("Ready to merge")).toBeInTheDocument()
	},
})

export const Failed = meta.story({
	args: FAILED_MISSION,
	parameters: {
		docs: {
			description: {
				story:
					"A mission that failed and that nobody has closed. Check that it keeps a running mission's row rather than being moved out of sight, and that the failed dot is the only thing that sets it apart.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(dotIn(canvasElement)).toHaveAttribute("data-badge", "failed")
		await expect(canvas.getByText("Failed")).toBeInTheDocument()
		await expect(canvas.getByText("last week")).toBeVisible()
	},
})

export const LongContent = meta.story({
	args: { ...WAITING_HUMAN_MISSION, objective: LONG_OBJECTIVE },
	parameters: {
		docs: {
			description: {
				story:
					"An objective no reader would write, in a panel at its 320px width. Check that the objective and the line under it each stay on one line and end in an ellipsis, and that the badge dot is not squeezed to make room for them.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const objective = canvas.getByText(LONG_OBJECTIVE)
		const row = slotIn(canvasElement, "mission-row")

		await expect(objective.scrollWidth).toBeGreaterThan(objective.clientWidth)
		await expect(row.getBoundingClientRect().height).toBeLessThan(72)
		await expect(dotIn(canvasElement)?.getBoundingClientRect().width).toBe(8)
	},
})
