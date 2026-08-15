import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { AppHeader } from "@workspace/ui/components/app-header"
import { ChatEmptyState } from "@workspace/ui/components/chat-empty-state"
import { ChatLayout } from "@workspace/ui/components/chat-layout"
import { ChatNotice } from "@workspace/ui/components/chat-notice"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/chat-turn"
import { ConnectionStatus } from "@workspace/ui/components/connection-status"
import { PromptInput } from "@workspace/ui/components/prompt-input"

const ANSWER =
	"Two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell."

const LONG_TRANSCRIPT = [
	"Walk me through the workspace layout.",
	"Where does the design system live?",
	"Which package owns the Tauri commands?",
	"How does the transcript get its data?",
	"What happens when the CLI crashes mid-turn?",
	"Can a turn be stopped once it started streaming?",
	"How is a tool approval surfaced?",
	"What resets when a session restarts?",
]

const READY_HEADER = (
	<AppHeader trailing={<ConnectionStatus state="ready" version="2.1.233" />} />
)

const meta = preview.meta({
	title: "Layout/ChatLayout",
	component: ChatLayout,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The whole chat screen shell: a fixed header, a transcript that always fills every pixel between header and composer, and a composer that keeps its natural height. The transcript region stretches even when it holds one short row, so a lone child can centre itself with `m-auto` instead of stranding itself at the top. It owns no data and no scroll logic of its own — it wraps MessageScroller and hands it the column width.",
			},
		},
	},
	args: {
		header: READY_HEADER,
		composer: <PromptInput onSubmit={fn()} />,
	},
})

export const Default = meta.story({
	args: {
		children: (
			<>
				<UserTurn>How is this workspace laid out?</UserTurn>
				<AssistantTurn copyText={ANSWER}>{ANSWER}</AssistantTurn>
			</>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a live conversation short enough not to scroll. Check that the two turns stay anchored to the top of the transcript while the region below them still belongs to the transcript, and that the composer sits flush at the bottom rather than floating up to meet the last message. Pick `Empty` for the first launch.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("banner")).toBeVisible()
		await expect(canvas.getByRole("textbox", { name: "Prompt" })).toBeVisible()
	},
})

export const Empty = meta.story({
	args: {
		children: <ChatEmptyState className="m-auto" onSetup={fn()} />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on first launch, when the transcript holds nothing but the empty state. This is the story that proves the stretch: `m-auto` only centres because the transcript fills the height, so check that the empty state sits in the middle of the free space rather than pinned under the header. Pick `Default` once a first turn exists.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Start with Claude Code")).toBeVisible()
	},
})

export const LongContent = meta.story({
	args: {
		busy: true,
		children: LONG_TRANSCRIPT.map((question) => (
			<UserTurn key={question}>{question}</UserTurn>
		)),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this once the transcript is taller than the viewport. Check that only the transcript scrolls — the header and the composer must stay put — and that the column keeps its reading width instead of spreading to the window edge. Pick `Default` for a transcript that fits.",
			},
		},
	},
})

export const Error = meta.story({
	args: {
		header: <AppHeader trailing={<ConnectionStatus state="crashed" />} />,
		notice: (
			<ChatNotice
				title="Claude Code stopped"
				description="Claude Code exited (code 1)."
				retry={{ label: "Restart session", onRetry: fn() }}
			/>
		),
		composer: <PromptInput disabled placeholder="Waiting for Claude Code…" />,
		children: (
			<>
				<UserTurn>How is this workspace laid out?</UserTurn>
				<AssistantTurn state="failed">{""}</AssistantTurn>
			</>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the CLI died mid-session. Check that the notice takes its own row directly above the composer without covering the transcript — the failed turn must stay readable, because losing the history is what the notice slot exists to avoid. Pick `Default` once the session has been restarted.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("button", { name: "Restart session" }),
		).toBeVisible()
		await expect(canvas.getByLabelText("user message")).toBeVisible()
	},
})
