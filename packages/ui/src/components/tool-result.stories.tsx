import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { listExhaustively } from "@workspace/storybook/story-utils"
import {
	ToolResult,
	ToolResultOutput,
	type ToolResultKind,
	type ToolResultProps,
	type ToolResultStatus,
} from "@workspace/ui/components/tool-result"

const TOOL_RESULT_STATUSES = listExhaustively<ToolResultStatus>({
	running: true,
	success: true,
	error: true,
	cancelled: true,
})

const TOOL_RESULT_KINDS = listExhaustively<ToolResultKind>({
	terminal: true,
	request: true,
	custom: true,
})

const STATUS_LABELS: Record<ToolResultStatus, string> = {
	running: "Running",
	success: "Completed",
	error: "Failed",
	cancelled: "Cancelled",
}

const INSTALL_OUTPUT = `$ bun install
bun install v1.3.13
+ @workspace/ui@0.0.1
+ react@19.2.6
+ motion@13.1.0
Checked 589 installs across 719 packages
Done in 292ms`

const STREAMING_OUTPUT = `$ bun run build
packages/ui:build: compiling 24 modules
packages/ui:build: bundling styles`

const TYPE_ERROR_OUTPUT = `$ bun run types
src/components/tool-result.tsx:184:12 - error TS2322:
  Type '"done"' is not assignable to type 'ToolResultStatus'.

184   status="done"
             ~~~~~~

Allowed values: "running" | "success" | "error" | "cancelled".
Found 1 error in 1 file.`

const MIGRATION_LOG = `$ bun run db:migrate --env staging
[00:00.012] connecting to postgres://staging.example.test:5432/opennest
[00:00.184] advisory lock acquired
[00:00.190] applying 0001_create_workspace.sql
[00:00.402] applying 0002_create_session.sql
[00:00.688] applying 0003_create_message.sql
[00:01.021] applying 0004_add_message_role_index.sql
[00:01.244] applying 0005_add_session_archived_at.sql
[00:01.503] applying 0006_backfill_session_archived_at.sql
[00:01.507]   scanning 12 480 rows
[00:02.940]   updated 12 480 rows
[00:03.118] applying 0007_create_tool_call.sql
[00:03.377] applying 0008_add_tool_call_status.sql
[00:03.610] applying 0009_add_tool_call_duration_ms.sql
[00:03.844] applying 0010_create_attachment.sql
[00:04.101] applying 0011_add_attachment_checksum.sql
[00:04.339] applying 0012_drop_legacy_transcript.sql
[00:04.577] applying 0013_create_workspace_member.sql
[00:04.812] applying 0014_add_workspace_member_role.sql
[00:05.046] applying 0015_add_workspace_slug_unique.sql
[00:05.281] applying 0016_create_audit_event.sql
[00:05.518] applying 0017_add_audit_event_actor_index.sql
[00:05.752] applying 0018_add_audit_event_payload.sql
[00:05.987] applying 0019_create_api_token.sql
[00:06.221] applying 0020_add_api_token_last_used_at.sql
[00:06.455] verifying schema checksum
[00:06.702] schema checksum 8f2c41ab matches manifest
[00:06.944] advisory lock released
[00:06.951] 20 migrations applied, 0 skipped`

const INSTALL_ARGS: ToolResultProps = {
	tool: "bash",
	title: "Install workspace dependencies",
	kind: "terminal",
	status: "success",
	meta: "1.2s",
	copyText: INSTALL_OUTPUT,
	onCopy: fn(),
	onOpenChange: fn(),
	children: <ToolResultOutput>{INSTALL_OUTPUT}</ToolResultOutput>,
}

const meta = preview.meta({
	title: "AI/ToolResult",
	component: ToolResult,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"Compact record of a single tool call: what ran, how it ended, and the output it produced. Reach for it inside an agent transcript where a tool call has to stay skimmable when collapsed and inspectable when opened. Status is carried by an icon and a word as well as a colour, so the four states stay distinguishable in greyscale and for colour-blind readers.",
			},
		},
	},
	args: INSTALL_ARGS,
	argTypes: {
		status: { control: "select", options: TOOL_RESULT_STATUSES },
		kind: { control: "select", options: TOOL_RESULT_KINDS },
		title: { control: "text" },
		tool: { control: "text" },
		meta: { control: "text" },
		defaultOpen: { control: "boolean" },
		collapseOnComplete: { control: "boolean" },
		maxHeight: { control: { type: "number", min: 80, max: 600, step: 20 } },
		children: { control: false },
		icon: { control: false },
	},
	decorators: [
		(Story) => (
			<div className="mx-auto w-full max-w-2xl">
				<Story />
			</div>
		),
	],
})

export const Playground = meta.story({})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: a tool that finished and left output worth keeping. Check that the header stays one line, that the disclosure collapses and expands from the header itself, and that the copy action sits under the output rather than in the header. Pick `Loading` instead while the call is still in flight, and `Error` when the run failed.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", {
			name: /Install workspace dependencies/,
		})

		await expect(trigger).toHaveAttribute("aria-expanded", "true")
		await userEvent.click(trigger)
		await expect(trigger).toHaveAttribute("aria-expanded", "false")
	},
})

export const Variants = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"All four statuses at once, the story to open when reviewing whether the states read apart. Check each row in greyscale and with the theme toggle: every status must be identifiable from its icon and its word alone, never from the colour. Use this over `Default` whenever the status vocabulary or its palette changes.",
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-4">
			{TOOL_RESULT_STATUSES.map((status) => (
				<ToolResult
					{...args}
					key={status}
					status={status}
					title={`Run migrations (${status})`}
					defaultOpen={false}
					meta={undefined}
				/>
			))}
		</div>
	),
	play: async ({ canvas }) => {
		for (const status of TOOL_RESULT_STATUSES) {
			await expect(
				canvas.getAllByText(STATUS_LABELS[status]).length,
			).toBeGreaterThan(0)
		}
	},
})

export const Loading = meta.story({
	args: {
		status: "running",
		title: "Build the design system",
		tool: "bash",
		meta: "0.9s",
		copyText: STREAMING_OUTPUT,
		children: <ToolResultOutput>{STREAMING_OUTPUT}</ToolResultOutput>,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The call is still in flight: output arrives line by line and nothing final can be shown yet. Check that the spinner keeps turning, that `aria-busy` is set on the wrapper so a screen reader announces the pending work, and that the panel stays open — a running call never collapses. `Default` covers the same tool once it has ended.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getAllByText("Running").length).toBeGreaterThan(0)
		await expect(canvas.getByRole("log")).toHaveAccessibleName("Running output")
	},
})

const FailedRun = meta.story({
	args: {
		status: "error",
		kind: "custom",
		title: "Type-check the workspace",
		tool: "tsc",
		meta: "3.4s",
		copyText: TYPE_ERROR_OUTPUT,
		onRetry: fn(),
		children: (
			<ToolResultOutput language="diff">{TYPE_ERROR_OUTPUT}</ToolResultOutput>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The failure surface, with a message the reader can act on: file, line, the value that was rejected and the values that are allowed. Check that the error stays legible in the muted panel, and that retry sits next to copy so recovering never means scrolling back up. `Variants` shows the cancelled state, which is an interruption rather than a failure.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Run again" }))
		await expect(args.onRetry).toHaveBeenCalled()
	},
})

export { FailedRun as Error }

export const LongContent = meta.story({
	args: {
		title: "Apply staging migrations",
		tool: "drizzle-kit",
		kind: "request",
		meta: "6.9s",
		copyText: MIGRATION_LOG,
		children: <ToolResultOutput>{MIGRATION_LOG}</ToolResultOutput>,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Output far taller than the panel, the case that decides whether a long run stays readable. Check that the panel caps itself instead of pushing the transcript down, that the log scrolls with a visible scrollbar, and that it takes focus from the keyboard so scrolling never needs a pointer. `Default` covers output short enough to fit whole.",
			},
		},
	},
	play: async ({ canvas }) => {
		const log = canvas.getByRole("log")

		await expect(log.scrollHeight).toBeGreaterThan(log.clientHeight)
		log.focus()
		await expect(log).toHaveFocus()
	},
})
