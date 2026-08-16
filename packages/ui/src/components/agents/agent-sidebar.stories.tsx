import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { AgentSidebar } from "@workspace/ui/components/agents/agent-sidebar"
import type { BotWorkingKind } from "@workspace/ui/components/bot-working"

const POSES: BotWorkingKind[] = ["thinking", "searching", "writing", "working"]

const LAST_MESSAGE =
	"Renamed the transport module and updated every caller, so the second turn resumes the first one cleanly again."

const SINGLE_LINE_HEIGHT = 20

const meta = preview.meta({
	title: "AI/AgentSidebar",
	component: AgentSidebar,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The conversation panel of an agent app, mounted whole: the animated sidebar shell around a single selected conversation. The row is the bot avatar itself, so the agent's live state is read off the pose rather than off a spinner bolted next to a label. The second line carries the last message at rest and is taken over by the pose verb while the agent is busy — a screen maps its running tool onto `status` and `pose`, and nothing here polls the transport.",
			},
		},
	},
	args: {
		status: "idle",
		pose: "thinking",
		name: "No Name",
		lastMessage: LAST_MESSAGE,
	},
	argTypes: {
		status: { control: "inline-radio", options: ["idle", "working"] },
		pose: { control: "select", options: POSES },
		name: { control: "text" },
		lastMessage: { control: "text" },
	},
})

export const Idle = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					'Nothing is running: the avatar rests in its waiting pose, `pose` is ignored and the second line shows the last message. The message is deliberately wider than the rail — check that it clips to one line with an ellipsis instead of wrapping the row taller or pushing the panel wider, that the row is the only stop in the tab order, and that it carries `aria-current="page"` as the selected conversation. Pick `Thinking` for the first pose a turn walks into.',
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await expect(
			canvas.getByRole("complementary", { name: "Conversations" }),
		).toBeVisible()

		const row = canvas.getByRole("button", { name: /No Name/ })
		await expect(row).toHaveAttribute("aria-current", "page")
		await expect(canvas.getByRole("img", { name: /waiting$/ })).toBeVisible()

		const detail = canvas.getByText(LAST_MESSAGE)
		await expect(detail.scrollWidth).toBeGreaterThan(detail.clientWidth)
		await expect(detail.getBoundingClientRect().height).toBeLessThanOrEqual(
			SINGLE_LINE_HEIGHT,
		)

		await userEvent.tab()
		await expect(row).toHaveFocus()
		await expect(row.matches(":focus-visible")).toBe(true)
	},
})

export const Thinking = meta.story({
	args: { status: "working", pose: "thinking" },
	parameters: {
		docs: {
			description: {
				story:
					"The agent is reasoning before it reaches for a tool. Check that the avatar holds the thinking pose, that the verb replaces the last message on the second line, and that the row never grows or reflows as the pose changes — only the drawing inside the avatar does.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("img", { name: /thinking$/ })).toBeVisible()
		await expect(canvas.getByText("thinking…")).toBeVisible()
		await expect(canvas.queryByText(LAST_MESSAGE)).toBeNull()
	},
})

export const Searching = meta.story({
	args: { status: "working", pose: "searching" },
	parameters: {
		docs: {
			description: {
				story:
					"A read or a lookup is running. Check that the pose reads as searching at 56px, the row size the sidebar gives it, and that the verb on the second line matches the pose the avatar is holding.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("img", { name: /searching$/ })).toBeVisible()
		await expect(canvas.getByText("searching…")).toBeVisible()
	},
})

export const Writing = meta.story({
	args: { status: "working", pose: "writing" },
	parameters: {
		docs: {
			description: {
				story:
					"The agent is producing an edit. Check that writing is distinguishable from thinking at row size, since the avatar and the verb are the only things separating the two states.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("img", { name: /writing$/ })).toBeVisible()
		await expect(canvas.getByText("writing…")).toBeVisible()
	},
})

export const Working = meta.story({
	args: { status: "working", pose: "working" },
	parameters: {
		docs: {
			description: {
				story:
					"A shell command or a long tool is running — the catch-all pose. Check that it stays legible beside `Searching` so the two never read as the same state.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("img", { name: /working$/ })).toBeVisible()
		await expect(canvas.getByText("working…")).toBeVisible()
	},
})

export const ReducedMotion = meta.story({
	args: { status: "working", pose: "working" },
	parameters: {
		docs: {
			description: {
				story:
					"The panel under `prefers-reduced-motion: reduce`, which is how the test browser renders every story here. Check that the avatar settles on a static frame of its pose instead of animating, that the shell drops its width and row springs to zero duration, and that nothing else changes: the row keeps its selection, its focus ring and its two lines, so the state is still readable without motion.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const row = canvas.getByRole("button", { name: /No Name/ })
		await expect(canvas.getByRole("img", { name: /working$/ })).toBeVisible()
		await expect(canvas.getByText("working…")).toBeVisible()
		await expect(row).toHaveAttribute("aria-current", "page")

		await userEvent.tab()
		await expect(row).toHaveFocus()
		await expect(row.matches(":focus-visible")).toBe(true)
	},
})
