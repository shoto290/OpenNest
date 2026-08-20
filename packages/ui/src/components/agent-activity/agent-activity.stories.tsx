import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	listExhaustively,
} from "@workspace/storybook/story-utils"
import {
	AgentActivity,
	type AgentActivityItem,
	type AgentActivityStatus,
} from "@workspace/ui/components/agent-activity"
import { Button } from "@workspace/ui/components/button"

const AGENT_ACTIVITY_STATUSES = listExhaustively<AgentActivityStatus>({
	working: true,
	complete: true,
	failed: true,
})

const THINKING_RUN: AgentActivityItem[] = [
	{
		id: "step-scope",
		type: "step",
		label: "Scoped the request to the nest card",
		status: "complete",
	},
	{
		id: "step-plan",
		type: "step",
		label: "Drafted the edit plan",
		status: "complete",
		meta: "3 files",
	},
	{
		id: "step-apply",
		type: "step",
		label: "Applied the edits",
		status: "complete",
	},
]

const STREAMING_RUN: AgentActivityItem[] = [
	{
		id: "step-scope",
		type: "step",
		label: "Scoped the request to the nest card",
		status: "complete",
	},
	{
		id: "step-apply",
		type: "step",
		label: "Applying the edits",
		status: "active",
	},
	{
		id: "step-verify",
		type: "step",
		label: "Run the checks",
		status: "pending",
	},
]

const FAILED_RUN: AgentActivityItem[] = [
	{
		id: "step-read",
		type: "step",
		label: "Read the workspace settings",
		status: "complete",
	},
	{
		id: "tool-run-build",
		type: "tool",
		action: "run",
		target: "bun run build-storybook",
	},
	{
		id: "text-reason",
		type: "text",
		content:
			"Build stopped: nest-card.tsx imports a token that no longer exists.",
	},
]

const TOOL_RUN: AgentActivityItem[] = [
	{
		id: "tool-read-config",
		type: "tool",
		action: "read",
		target: "apps/desktop/src/nest-config.ts",
	},
	{
		id: "tool-edit-card",
		type: "tool",
		action: "edit",
		target: "packages/ui/src/components/nest-card.tsx",
		additions: 24,
		deletions: 6,
	},
	{
		id: "tool-run-lint",
		type: "tool",
		action: "run",
		target: "bun run lint",
	},
]

const TRACE_RUN: AgentActivityItem[] = [
	{
		id: "trace-thinking",
		type: "trace",
		kind: "thinking",
		label: "Compared both layouts",
	},
	{
		id: "trace-read",
		type: "trace",
		kind: "read",
		label: "Read",
		detail: "packages/ui/src/styles/globals.css",
	},
	{
		id: "trace-run",
		type: "trace",
		kind: "run",
		label: "Run",
		detail: "bun run types",
	},
]

const LONG_RUN: AgentActivityItem[] = [
	"apps/desktop/src/nest-config.ts",
	"apps/desktop/src/routes/nest.tsx",
	"packages/ui/src/components/nest-card.tsx",
	"packages/ui/src/components/nest-list.tsx",
	"packages/ui/src/components/nest-empty.tsx",
	"packages/ui/src/styles/globals.css",
	"packages/ui/src/lib/utils.ts",
	"packages/ui/src/hooks/use-nest.ts",
	"packages/ui/.storybook/preview.tsx",
	"packages/ui/package.json",
	"turbo.json",
	"biome.json",
].map<AgentActivityItem>((target, index) => ({
	id: `tool-read-${index}`,
	type: "tool",
	action: "read",
	target,
}))

const RunHandoff = () => {
	const [status, setStatus] = useState<AgentActivityStatus>("working")

	return (
		<div className="flex flex-col gap-6">
			<Button size="sm" onClick={() => setStatus("complete")}>
				Finish both runs
			</Button>
			<AgentActivity
				items={TOOL_RUN}
				status={status}
				duration={9}
				collapseOnComplete
			/>
			<AgentActivity
				items={TRACE_RUN}
				status={status}
				duration={9}
				collapseOnComplete={false}
			/>
		</div>
	)
}

const meta = preview.meta({
	title: "AI/AgentActivity",
	component: AgentActivity,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"One compact activity line per agent turn: a live status while the turn runs, a one-line summary once it settles, and the full trace behind a disclosure. Reach for it above a message bubble to keep tool calls, searches and reasoning steps inspectable without letting them own the transcript.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="w-full max-w-xl">
				<Story />
			</div>
		),
	],
	args: {
		items: THINKING_RUN,
		status: "complete" as const,
		duration: 12,
		onOpenChange: fn(),
	},
	argTypes: {
		status: { control: "inline-radio", options: AGENT_ACTIVITY_STATUSES },
		duration: { control: { type: "number", min: 0 } },
		defaultOpen: { control: "boolean" },
		collapseOnComplete: { control: "boolean" },
		maxHeight: { control: { type: "number", min: 64 } },
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Knob story for the four props that drive the surface: `status` swaps the live row for the summary trigger, `duration` feeds the `Thought for 12s` summary, `defaultOpen` and `collapseOnComplete` decide whether the settled trace starts visible. Check that the trigger takes focus from the keyboard and that Enter toggles it.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: /Thought for/ })

		await expect(trigger).toHaveAttribute("aria-expanded", "false")

		await userEvent.tab()
		await expect(trigger).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		await expect(trigger).toHaveAttribute("aria-expanded", "true")
		await expect(args.onOpenChange).toHaveBeenCalledWith(true)
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: a turn that already finished. The trace is folded behind a single line so a long transcript stays readable, and the summary still names what happened and how long it took. Pick `Expanded` when the point is the trace itself.",
			},
		},
	},
})

export const Loading = meta.story({
	args: { items: STREAMING_RUN, status: "working" },
	parameters: {
		docs: {
			description: {
				story:
					"The turn is still running: the trigger is replaced by a shimmering status row, the disclosure is forced open, and new items glide in as they stream. Check that no chevron is offered here — there is nothing to fold while the agent is mid-run — and that the step icons read pending, active, complete.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("button")).toBeNull()
		await expect(canvas.getByRole("status")).toHaveTextContent("Thinking…")
	},
})

export const Expanded = meta.story({
	args: { defaultOpen: true },
	parameters: {
		docs: {
			description: {
				story:
					"Same finished turn as `Default`, mounted already open via `defaultOpen`. Reach for it when the activity is the subject of the screen — a run detail panel rather than a chat transcript — and check that the trace lands without an entrance animation on mount.",
			},
		},
	},
})

export const Error = meta.story({
	args: { items: FAILED_RUN, status: "failed", duration: 34 },
	parameters: {
		docs: {
			description: {
				story:
					"The failure surface. A failed turn ignores `collapseOnComplete` and opens itself, because the reason for the failure is the only thing worth reading; the summary switches to `Failed after 34s` in destructive tone. Check that it can still be folded back by keyboard — inspectable, not pinned.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: /Failed after/ })

		await expect(trigger).toHaveAttribute("aria-expanded", "true")

		await userEvent.tab()
		await expect(trigger).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		await expect(trigger).toHaveAttribute("aria-expanded", "false")
	},
})

export const LongContent = meta.story({
	args: { items: LONG_RUN, defaultOpen: true, duration: 96 },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Twelve tool calls against a `maxHeight` of 208px. Once open, the viewport scrolls instead of pushing the rest of the transcript down, and the mask fades both edges so a cut row never reads as the last one. Use it to check truncation of long file paths.",
			},
		},
	},
})

export const CollapseOnComplete = meta.story({
	args: { items: TOOL_RUN },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The working → complete handoff, the one moment `collapseOnComplete` is read. Finish the runs: the first activity folds itself into its summary, the second keeps its trace open. Pick this story over `Default` when checking that a turn settling mid-conversation does not shift the layout underneath it.",
			},
		},
	},
	render: () => <RunHandoff />,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Finish both runs" }),
		)

		const collapsing = await canvas.findByRole("button", {
			name: /Ran 3 tools/,
		})
		await expect(collapsing).toHaveAttribute("aria-expanded", "false")

		const staying = await canvas.findByRole("button", {
			name: /tool calls/,
		})
		await expect(staying).toHaveAttribute("aria-expanded", "true")
	},
})
