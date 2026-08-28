import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { listExhaustively } from "@workspace/storybook/story-utils"
import { Notice, type NoticeTone } from "@workspace/ui/components/notice"

const CHAT_NOTICE_TONES = listExhaustively<NoticeTone>({
	warning: true,
	error: true,
})

const meta = preview.meta({
	title: "Feedback/Notice",
	component: Notice,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The single surface a chat uses to tell the operator that the agent side broke: Claude Code missing, transport dead, turn failed. Every notice states what happened and what the operator can do about it — a Retry button appears only when replaying the same prompt is actually valid, so a notice without one means retrying cannot help.",
			},
		},
	},
	args: {
		title: "The last turn failed",
		description:
			"The model stopped responding mid-turn. Nothing was applied, so the same prompt can be sent again.",
	},
	argTypes: {
		tone: { control: "select", options: CHAT_NOTICE_TONES },
		title: { control: "text" },
		description: { control: "text" },
		detail: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className="w-[30rem] max-w-full">
				<Story />
			</div>
		),
	],
})

export const Playground = meta.story({
	args: {
		detail: "stream timeout after 60s",
		retry: { onRetry: fn(), attempt: 1, maxAttempts: 3 },
	},
})

export const Variants = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Both tones side by side. `warning` is the recoverable-by-configuration surface (something is missing on this machine), `error` is the run-time failure surface (something died mid-session). Check that the two read as different at a glance in light and dark, and that neither relies on the icon colour alone.",
			},
		},
	},
	render: () => (
		<div className="flex flex-col gap-3">
			{CHAT_NOTICE_TONES.map((tone) => (
				<Notice
					key={tone}
					tone={tone}
					title={`Tone: ${tone}`}
					description="The same notice body rendered in each tone."
				/>
			))}
		</div>
	),
})

export const ClaudeCodeUnavailable = meta.story({
	args: {
		tone: "warning",
		title: "Claude Code isn't available",
		description:
			"OpenNest could not find the claude binary on this machine. Install it, or point OpenNest at an existing install, then start a new session.",
		detail: "spawn claude ENOENT",
		action: { label: "Open setup guide", onClick: fn() },
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the chat cannot start at all because the local Claude Code install is missing or unreachable. Check that no Retry button is offered — the prompt was never sent, and re-sending it cannot conjure a binary — and that the only action points at the fix the operator must perform outside the app. Use `TransportCrashed` instead when Claude Code did start and then died.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("status")).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Retry" })).toBeNull()
		await expect(
			canvas.getByRole("button", { name: "Open setup guide" }),
		).toBeVisible()
	},
})

export const TransportCrashed = meta.story({
	args: {
		title: "The Claude Code transport crashed",
		description:
			"The session process exited before the turn completed. Reconnect to start a fresh transport — the conversation history is kept.",
		detail: "exit code 134 · SIGABRT",
		action: { label: "Reconnect", onClick: fn() },
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the process behind the session died mid-turn. Check that the recovery action is Reconnect and that no Retry button is rendered: the turn cannot be replayed onto a dead transport, so offering Retry would send the operator into a loop. Use `TurnFailedRetryable` when the transport is still alive.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByRole("alert")).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Retry" })).toBeNull()

		await userEvent.click(canvas.getByRole("button", { name: "Reconnect" }))
		await expect(args.action?.onClick).toHaveBeenCalled()
	},
})

export const TurnFailedRetryable = meta.story({
	args: {
		detail: "stream timeout after 60s",
		retry: { onRetry: fn(), attempt: 1, maxAttempts: 3 },
		onDismiss: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the transport is healthy and only the turn failed, with no partial write applied. This is the one state where Retry is valid: check that the button is keyboard-reachable, calls back with the same prompt, and that the notice can also be dismissed when the operator would rather move on. Compare with `RetryExhausted`, which is the same failure after the attempt budget ran out.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const retry = canvas.getByRole("button", { name: "Retry" })

		await userEvent.click(retry)
		await expect(args.retry?.onRetry).toHaveBeenCalled()

		await userEvent.click(
			canvas.getByRole("button", { name: "Dismiss notice" }),
		)
		await expect(args.onDismiss).toHaveBeenCalled()
	},
})

export const RetryExhausted = meta.story({
	args: {
		detail: "stream timeout after 60s",
		retry: { onRetry: fn(), attempt: 3, maxAttempts: 3 },
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the same turn already burned its attempt budget. Check that the Retry button is gone rather than disabled, and that the note explains why, so the operator stops hammering a call that will fail the same way. `TurnFailedRetryable` covers the attempts that are still left.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("button", { name: "Retry" })).toBeNull()
		await expect(
			canvas.getByText("Retry limit reached after 3 attempts"),
		).toBeVisible()
	},
})

export const LongContent = meta.story({
	args: {
		title:
			"The last turn failed while writing packages/ui/src/components/notice.tsx",
		description:
			"The model stopped responding after the tool call returned, while the edit was still being applied to a long path deep in the workspace. Nothing was written to disk, the transport is still connected, and the same prompt can be sent again once the operator has read the diagnostic below.",
		detail:
			"stream timeout after 60s · request_id req_0000000000000000000000000000 · workspace /Users/example/projects/opennest/packages/ui",
		retry: { onRetry: fn() },
		action: { label: "Copy diagnostic", onClick: fn() },
		onDismiss: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when checking layout under a wrapping title, a multi-line description and a diagnostic longer than the notice. Check that the diagnostic truncates on one line instead of pushing the actions off the surface, and that the action row wraps rather than overflowing.",
			},
		},
	},
})
