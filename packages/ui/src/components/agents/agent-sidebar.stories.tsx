import { expect, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AgentSidebar,
	type AgentSidebarProps,
} from "@workspace/ui/components/agents/agent-sidebar"
import type { BotWorkingKind } from "@workspace/ui/components/bot-working"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

const POSES: BotWorkingKind[] = [
	"thinking",
	"searching",
	"writing",
	"working",
	"waiting",
]

const LAST_MESSAGE =
	"Renamed the transport module and updated every caller, so the second turn resumes the first one cleanly again."

const SINGLE_LINE_HEIGHT = 20

const FRAME_POLL = { interval: 10 }

const railWidth = () => {
	const probe = document.createElement("div")
	probe.style.width = "var(--sidebar-width-icon)"
	document.body.append(probe)
	const width = probe.getBoundingClientRect().width
	probe.remove()
	return width
}

const NARROW_VIEWPORT = {
	narrow: { name: "Narrow", styles: { width: "800px", height: "900px" } },
}

const renderShell = (defaultOpen: boolean) => (args: AgentSidebarProps) => (
	<WorkspaceShell
		defaultOpen={defaultOpen}
		sidebar={<AgentSidebar {...args} />}
	>
		{null}
	</WorkspaceShell>
)

const meta = preview.meta({
	title: "AI/AgentSidebar",
	component: AgentSidebar,
	render: renderShell(true),
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The conversation panel of an agent app, mounted whole: the animated sidebar shell around a single selected conversation. It carries no chrome of its own — an empty pinned region clears the window controls, and the open state comes from the `WorkspaceShell` above it, so Cmd/Ctrl+B and whatever trigger the page mounts drive the panel and the column beside it together. The row is the bot avatar itself, so the agent's live state is read off the pose rather than off a spinner bolted next to a label. The second line carries the last message at rest and is taken over by the pose verb while the agent is busy — a screen maps its running tool onto `status` and `pose`, and nothing here polls the transport.",
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
					'Nothing is running: the avatar rests in its waiting pose, `pose` is ignored and the second line shows the last message. The message is deliberately wider than the rail — check that it clips to one line with an ellipsis instead of wrapping the row taller or pushing the panel wider, and that it carries `aria-current="page"` as the selected conversation. The row is the only stop Tab finds here, and the empty region above it holds the window-control gutter clear without adding a target. The panel still announces itself at rest from a live region that sits outside it, so the edge back to idle is spoken rather than silent. Pick `Thinking` for the first pose a turn walks into, `Collapsed` for the icon rail.',
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const panel = canvas.getByRole("complementary", { name: "Conversations" })
		await expect(panel).toBeVisible()
		await expect(panel).toHaveAttribute("aria-busy", "false")

		const liveRegion = canvas.getByRole("status")
		await expect(liveRegion).toHaveTextContent("No Name idle")
		await expect(panel.contains(liveRegion)).toBe(false)

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

		await expect(
			canvas.getByRole("complementary", { name: "Conversations" }),
		).toHaveAttribute("aria-busy", "true")
		await expect(canvas.getByRole("status")).toHaveTextContent("No Name thinking")
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

		await expect(
			canvas.getByRole("complementary", { name: "Conversations" }),
		).toHaveAttribute("aria-busy", "true")
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"No Name searching",
		)
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

		await expect(
			canvas.getByRole("complementary", { name: "Conversations" }),
		).toHaveAttribute("aria-busy", "true")
		await expect(canvas.getByRole("status")).toHaveTextContent("No Name writing")
	},
})

export const Working = meta.story({
	args: { status: "working", pose: "working" },
	parameters: {
		docs: {
			description: {
				story:
					"A shell command or a long tool is running — the catch-all pose. Check that it stays legible beside `Searching` so the two never read as the same state, that the panel reports itself busy while it runs, and that the announcement sits outside the busy panel — a live region nested inside an `aria-busy` landmark is swallowed and never reaches a screen reader. Pick `Narrow` for the same state in a window one notch above the drawer breakpoint.",
			},
		},
	},
	play: async ({ canvas }) => {
		const panel = canvas.getByRole("complementary", { name: "Conversations" })
		await expect(canvas.getByRole("img", { name: /working$/ })).toBeVisible()
		await expect(canvas.getByText("working…")).toBeVisible()

		await expect(panel).toHaveAttribute("aria-busy", "true")

		const liveRegion = canvas.getByRole("status")
		await expect(liveRegion).toHaveTextContent("No Name working")
		await expect(panel.contains(liveRegion)).toBe(false)

		await expect(panel.getBoundingClientRect().width).toBeGreaterThan(
			railWidth(),
		)
	},
})

export const Narrow = meta.story({
	args: { status: "working", pose: "working" },
	globals: { viewport: { value: "narrow" } },
	parameters: {
		viewport: { options: NARROW_VIEWPORT },
		docs: {
			description: {
				story:
					"The same running agent in a window just wide enough to keep two columns, one notch above the width where the panel becomes a drawer. Check that it is still a column at its full width rather than the icon rail — a breakpoint that collapsed it early would fail here — and that the row keeps its avatar, its verb and its selection at that width. Pick `Working` for a full window, `Layout/WorkspaceShell` `OffCanvas` for the drawer a narrower window gets instead.",
			},
		},
	},
	play: async ({ canvas }) => {
		const panel = canvas.getByRole("complementary", { name: "Conversations" })
		await expect(canvas.getByRole("img", { name: /working$/ })).toBeVisible()
		await expect(canvas.getByText("working…")).toBeVisible()
		await expect(panel.getBoundingClientRect().width).toBeGreaterThan(
			railWidth(),
		)
	},
})

export const PermissionPending = meta.story({
	args: { status: "working", pose: "waiting" },
	parameters: {
		docs: {
			description: {
				story:
					'The turn is blocked on a permission prompt, which a host maps to `status="working"` with `pose="waiting"` — the turn is waiting on the reader, not over. Check that the avatar holds its listening pose and never the resting one it wears when nothing runs: the panel reports itself busy and the announcement says the agent is waiting, so an avatar that looked idle here would contradict both at once. Pick `Idle` for the resting pose this state must not borrow.',
			},
		},
	},
	play: async ({ canvas }) => {
		const panel = canvas.getByRole("complementary", { name: "Conversations" })
		await expect(canvas.getByRole("img", { name: /listening$/ })).toBeVisible()
		await expect(canvas.queryByRole("img", { name: /waiting$/ })).toBeNull()
		await expect(canvas.getByText("waiting…")).toBeVisible()

		await expect(panel).toHaveAttribute("aria-busy", "true")

		const liveRegion = canvas.getByRole("status")
		await expect(liveRegion).toHaveTextContent("No Name waiting")
		await expect(panel.contains(liveRegion)).toBe(false)
	},
})

export const Collapsed = meta.story({
	render: renderShell(false),
	parameters: {
		docs: {
			description: {
				story:
					"The panel opened on its icon rail, which is how a host restores a remembered choice through `defaultOpen`. Check that the rail is one avatar wide with the avatar sitting centred in it and nothing clipped against either edge, that the row is still the first and only thing Tab reaches, and that the two lines of text are gone from the picture and from the accessibility tree — the row keeps its name through `aria-label` instead. Pick `Toggle` to watch the panel travel between the two widths.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const panel = canvas.getByRole("complementary", { name: "Conversations" })
		const rail = railWidth()
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBeCloseTo(rail, 0)
		}, FRAME_POLL)

		const railRow = canvas.getByRole("button", { name: "No Name" })
		await userEvent.tab()
		await expect(railRow).toHaveFocus()
		await expect(railRow.matches(":focus-visible")).toBe(true)

		const panelBox = panel.getBoundingClientRect()
		const avatarBox = canvas
			.getByRole("img", { name: /waiting$/ })
			.getBoundingClientRect()
		await expect(avatarBox.left).toBeGreaterThanOrEqual(panelBox.left)
		await expect(avatarBox.right).toBeLessThanOrEqual(panelBox.right)

		await expect(railRow).toBeVisible()
		await expect(canvas.queryByRole("button", { name: /Renamed/ })).toBeNull()
		await expect(
			canvas.getByText(LAST_MESSAGE).closest("[aria-hidden='true']"),
		).not.toBeNull()
	},
})

export const Toggle = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The collapse itself, driven from Cmd/Ctrl+B — the panel carries no trigger of its own, so the shortcut and whatever control the page mounts are the two ways in. Check that one press takes the panel to the rail and back, that focus stays exactly where it was instead of falling back to the page, and that the avatar rides the width down without the row changing height or the transcript beside it reflowing twice. Pick `Collapsed` for the resting rail.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const panel = canvas.getByRole("complementary", { name: "Conversations" })
		const row = canvas.getByRole("button", { name: /No Name/ })
		const detail = canvas.getByText(LAST_MESSAGE)
		const rowHeight = row.getBoundingClientRect().height
		const rail = railWidth()

		await expect(panel).toHaveAttribute("data-state", "expanded")
		await userEvent.tab()
		await expect(row).toHaveFocus()

		await userEvent.keyboard("{Meta>}b{/Meta}")
		await expect(panel).toHaveAttribute("data-state", "collapsed")
		await expect(row).toHaveFocus()
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBeCloseTo(rail, 0)
		}, FRAME_POLL)
		await expect(row.getBoundingClientRect().height).toBe(rowHeight)

		await userEvent.keyboard("{Control>}b{/Control}")
		await expect(panel).toHaveAttribute("data-state", "expanded")
		await expect(row).toHaveFocus()
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBeGreaterThan(rail)
			const label = detail.closest("[aria-hidden]")
			await expect(label && getComputedStyle(label).opacity).toBe("1")
		}, FRAME_POLL)
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

		await expect(
			canvas.getByRole("complementary", { name: "Conversations" }),
		).toHaveAttribute("aria-busy", "true")
		await expect(canvas.getByRole("status")).toHaveTextContent("No Name working")

		await userEvent.tab()
		await expect(row).toHaveFocus()
		await expect(row.matches(":focus-visible")).toBe(true)
	},
})
