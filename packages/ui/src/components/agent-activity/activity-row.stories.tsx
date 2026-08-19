import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import type { AgentActivityItem } from "@workspace/ui/components/agent-activity"
import { ActivityRow } from "@workspace/ui/components/agent-activity/activity-row"
import { Icons } from "@workspace/ui/components/icons"

type StackProps = { items: AgentActivityItem[] }

const Stack = ({ items }: StackProps) => (
	<div className="space-y-0.5">
		{items.map((item) => (
			<ActivityRow item={item} key={item.id} />
		))}
	</div>
)

const STEPS: AgentActivityItem[] = [
	{
		id: "step-complete",
		type: "step",
		label: "Read the nest manifest",
		status: "complete",
		meta: "2 files",
	},
	{
		id: "step-active",
		type: "step",
		label: "Rewriting the nest card",
		status: "active",
	},
	{
		id: "step-pending",
		type: "step",
		label: "Run the checks",
		status: "pending",
	},
	{
		id: "step-default",
		type: "step",
		label: "Status left out, so the step reads as done",
	},
]

const SEARCH: AgentActivityItem = {
	id: "search-tokens",
	type: "search",
	query: "how to theme a design system with css variables",
	results: [
		{
			id: "result-handbook",
			title: "Theming a token layer",
			domain: "nestbook.example",
			url: "https://nestbook.example/theming",
		},
		{
			id: "result-notes",
			title: "Every tint we ship, and why",
			domain: "notes.nestbook.example",
			url: "https://notes.nestbook.example/tints",
			icon: <Icons.Docs className="size-3" strokeWidth={2} />,
		},
		{
			id: "result-local",
			title: "Nest theming notes, from the workspace",
		},
	],
	moreCount: 4,
}

const TOOLS: AgentActivityItem[] = [
	{
		id: "tool-read",
		type: "tool",
		action: "read",
		target: "packages/ui/src/components/nest-card.tsx",
	},
	{
		id: "tool-edit",
		type: "tool",
		action: "edit",
		target: "packages/ui/src/components/nest-card.tsx",
	},
	{
		id: "tool-write",
		type: "tool",
		action: "write",
		target: "packages/ui/src/components/nest-empty.tsx",
	},
	{
		id: "tool-run",
		type: "tool",
		action: "run",
		target: "bun run types",
	},
	{
		id: "tool-unknown",
		type: "tool",
		action: "measure",
		target: "packages/ui/src/styles/nest-tokens.css",
	},
]

const TRACES: AgentActivityItem[] = [
	{
		id: "trace-thinking",
		type: "trace",
		kind: "thinking",
		label: "Weighed both layouts",
	},
	{
		id: "trace-message",
		type: "trace",
		kind: "message",
		label: "Answered",
		detail: "The rail keeps its width below 42rem",
	},
	{
		id: "trace-write",
		type: "trace",
		kind: "write",
		label: "Write",
		detail: "packages/ui/src/components/nest-list.tsx",
	},
	{
		id: "trace-run",
		type: "trace",
		kind: "run",
		label: "Run",
		detail: "bun run lint",
	},
	{
		id: "trace-read",
		type: "trace",
		kind: "read",
		label: "Read",
		detail: "docs/nest-brief.png",
	},
	{
		id: "trace-custom",
		type: "trace",
		kind: "deploy",
		label: "Deploy",
		detail: "nest-preview.example",
		icon: <Icons.Web className="size-4" />,
	},
]

const meta = preview.meta({
	title: "AI/ActivityRow",
	component: ActivityRow,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"One line of an agent's trace, picked by the item's `type`. It is the piece `AgentActivity` repeats behind its disclosure, and it draws nothing around itself: no card, no rule, no timing — the surface above owns all of that. Five shapes share one rhythm, a 1rem icon column and a 1.75rem minimum row, so a run that mixes steps, prose, searches, tool calls and traces still reads as a single column. Reach for it directly only when a surface streams its own trace; reach for `AgentActivity` otherwise.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="w-full max-w-xl text-sm">
				<Story />
			</div>
		),
	],
	args: { item: STEPS[0] },
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Knob story for the single prop: swap `item.type` to walk every shape, and `item.status` to walk a step's three states. Check that a row never sets its own type scale — it inherits the `text-sm` of the surface it lands in, which is why the mono chips read one step smaller than their label.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Read the nest manifest")).toBeVisible()
		await expect(canvas.getByText("2 files")).toBeVisible()
	},
})

export const Steps = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The step shape and its three states in reading order: complete carries a check, active a breathing dot, pending a hollow ring with the label dimmed to muted. Leave `status` out and the row reads as complete — a trace replayed after the fact has nothing left to wait on. `meta` is the right edge, for the count or the duration a step ended on. Check that only pending is dimmed, so the eye lands on what is still owed.",
			},
		},
	},
	render: () => <Stack items={STEPS} />,
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Run the checks")).toBeVisible()
	},
})

export const Text = meta.story({
	args: {
		item: {
			id: "text-reason",
			type: "text",
			content:
				"The build stopped: nest-card.tsx imports a tint that left the palette two releases ago.",
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The prose shape, for the sentence a run needs when no icon would say it better. It takes no icon column and stays muted, so it reads as commentary between the steps rather than as one more thing that happened. Reach for it to explain a failure in the trace itself.",
			},
		},
	},
})

export const Search = meta.story({
	args: { item: SEARCH },
	parameters: {
		docs: {
			description: {
				story:
					"The search shape at full width: the query on its own line, results indented under it, and the overflow counted rather than listed. A result with a `url` renders as a link and takes focus with a visible ring; one without stays inert text, which is how a local hit reads. `icon` overrides the default globe per result. Check that a result is reachable by keyboard and that its domain truncates before its title does.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const link = canvas.getByRole("link", { name: /Theming a token layer/ })

		await expect(link).toHaveAttribute(
			"href",
			"https://nestbook.example/theming",
		)

		await userEvent.tab()
		await expect(link).toHaveFocus()

		await expect(canvas.getByText("+4 more")).toBeVisible()
	},
})

export const SearchPending = meta.story({
	args: {
		item: {
			id: "search-pending",
			type: "search",
			query: "reduced motion defaults for a disclosure",
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The empty state of the search shape — the query is out, nothing has come back yet. No placeholder rows, no skeleton: the row simply stays one line tall and grows as results stream in, so the trace under it never jumps twice. Check that neither the results block nor the overflow count leaves a gap behind.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("link")).toBeNull()
	},
})

export const Tools = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The tool shape across its actions: `read` takes a file glyph, `edit` and `write` share the pencil, `run` takes the terminal, and anything else falls back to the wrench — the union stays open so a new tool needs no change here. The action is capitalised for the reader and the target sits in a mono chip that truncates from the right, keeping a long path on one line.",
			},
		},
	},
	render: () => <Stack items={TOOLS} />,
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Measure")).toBeVisible()
	},
})

export const ToolDiff = meta.story({
	args: {
		item: {
			id: "tool-diff",
			type: "tool",
			action: "edit",
			target: "packages/ui/src/components/nest-card.tsx",
			additions: 24,
			deletions: 6,
		},
	},
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"An edit that reports its diff. Both counts are optional and independent — a pure addition shows only the `+`. They sit in tabular mono at the right edge so a column of edits lines its digits up rather than shimmering row to row. The destructive red on the deletions is the token's known contrast gap, flagged for review rather than worked around here.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("+24")).toBeVisible()
		await expect(canvas.getByText("−6")).toBeVisible()
	},
})

export const Traces = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The trace shape, the terser sibling of the tool row: a fixed three-column grid — glyph, label, optional detail — so a run of traces aligns its labels no matter how long each detail is. `kind` picks the glyph and stays open like the tool action, and `icon` overrides it outright, as the deploy row does. Drop `detail` and the third column holds its place instead of collapsing.",
			},
		},
	},
	render: () => <Stack items={TRACES} />,
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Weighed both layouts")).toBeVisible()
		await expect(canvas.getByText("nest-preview.example")).toBeVisible()
	},
})
