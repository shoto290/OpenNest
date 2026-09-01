import { useState } from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { AppHeader } from "@workspace/ui/components/app-header"
import { ChatEmptyState } from "@workspace/ui/components/chat-empty-state"
import { ConnectionStatus } from "@workspace/ui/components/connection-status"
import { Notice } from "@workspace/ui/components/notice"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import type { RosterBot } from "@workspace/ui/components/roster"
import {
	ThreadLayout,
	type ThreadLayoutProps,
} from "@workspace/ui/components/thread-layout"
import {
	ToolApproval,
	ToolApprovalCode,
} from "@workspace/ui/components/tool-approval"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"

const ANSWER =
	"Two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell."

const BOT: RosterBot = {
	id: "bot-skippy",
	name: "Skippy",
	animal: "owl",
	blot: "blue",
}

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

const CONVERSATION = (
	<>
		<UserTurn>How is this workspace laid out?</UserTurn>
		<AssistantTurn copyText={ANSWER} identity={BOT}>
			{ANSWER}
		</AssistantTurn>
	</>
)

const SCROLLING_TRANSCRIPT = LONG_TRANSCRIPT.map((question) => (
	<UserTurn key={question}>{question}</UserTurn>
))

const TRANSCRIPT_TOP_PADDING = 32
const TRANSCRIPT_BOTTOM_PADDING = 16

const scrollerOf = (transcript: HTMLElement) => {
	const scroller = transcript.closest<HTMLElement>(
		'[data-slot="message-scroller"]',
	)
	if (!scroller)
		throw new globalThis.Error("This transcript sits in no scroller")
	return scroller
}

const spaceUnderLastRow = (transcript: HTMLElement, scroller: HTMLElement) => {
	const lastRow = transcript.lastElementChild
	if (!lastRow) throw new globalThis.Error("This transcript holds no row")
	return Math.round(
		scroller.getBoundingClientRect().bottom -
			lastRow.getBoundingClientRect().bottom,
	)
}

const RegionProbe = (props: ThreadLayoutProps) => {
	const [region, setRegion] = useState<HTMLDivElement | null>(null)
	const [composer, setComposer] = useState<HTMLTextAreaElement | null>(null)
	const holdsComposer = region?.contains(composer) ?? false

	return (
		<ThreadLayout
			{...props}
			rootRef={setRegion}
			notice={
				<Notice
					tone="warning"
					title={holdsComposer ? "Composer inside" : "Composer outside"}
					description="What the handed-back region contains."
				/>
			}
			composer={<PromptInput textareaRef={setComposer} onSubmit={fn()} />}
		/>
	)
}

const meta = preview.meta({
	title: "Layout/ThreadLayout",
	component: ThreadLayout,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The whole chat screen shell: a fixed header, a transcript that always fills every pixel between header and composer, and a composer that keeps its natural height. The transcript region stretches even when it holds one short row, so a lone child can centre itself with `m-auto` instead of stranding itself at the top. It owns no data and no scroll logic of its own — it wraps MessageScroller and lets the transcript run the full width of the shell.",
			},
		},
	},
	args: {
		header: READY_HEADER,
		composer: <PromptInput onSubmit={fn()} />,
	},
})

export const Default = meta.story({
	args: { children: CONVERSATION },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a live conversation short enough not to scroll. Check that the two turns stay anchored to the top of the transcript while the region below them still belongs to the transcript, and that the composer sits flush at the bottom rather than floating up to meet the last message. Pick `Empty` for the first launch.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByRole("banner")).toBeVisible()
		await expect(canvas.getByRole("textbox", { name: "Prompt" })).toBeVisible()
		await expect(
			canvasElement.querySelector('[data-slot="message-scroller-older"]'),
		).toBeNull()
	},
})

export const Empty = meta.story({
	args: {
		children: (
			<ChatEmptyState className="m-auto" name="Nest Keeper" onSetup={fn()} />
		),
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
		await expect(
			canvas.getByRole("heading", { name: "Nest Keeper" }),
		).toBeVisible()
	},
})

export const LongContent = meta.story({
	args: { busy: true, children: SCROLLING_TRANSCRIPT },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this once the transcript is taller than the viewport. Check that only the transcript scrolls — the header and the composer must stay put — and that the rows wrap inside the full-width transcript however wide the window gets, without pushing the layout sideways. At the live edge the last row keeps one small gap above the composer, never a band of empty space. Pick `Default` for a transcript that fits.",
			},
		},
	},
	play: async ({ canvas }) => {
		const transcript = canvas.getByRole("log")
		const scroller = scrollerOf(transcript)
		const spacing = getComputedStyle(transcript)

		await expect(spacing.paddingTop).toBe(`${TRANSCRIPT_TOP_PADDING}px`)
		await expect(spacing.paddingBottom).toBe(`${TRANSCRIPT_BOTTOM_PADDING}px`)

		scroller.scrollTo({ top: scroller.scrollHeight })

		await waitFor(() =>
			expect(spaceUnderLastRow(transcript, scroller)).toBeGreaterThanOrEqual(
				TRANSCRIPT_BOTTOM_PADDING,
			),
		)
	},
})

export const OlderMessages = meta.story({
	args: { older: { has: true, onLoad: fn() }, children: SCROLLING_TRANSCRIPT },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the host pages the transcript by cursor. The layout owns nothing here — `older` is handed straight to MessageScroller, so the control sits above the first row inside the scrolling transcript and scrolls with it, never between the header and the transcript. Check that the header and the composer are untouched by it, and pick `Default` for a host that loads the whole conversation at once.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Load older messages" }),
		)
		await expect(args.older?.onLoad).toHaveBeenCalledTimes(1)
	},
})

export const LoadingOlderMessages = meta.story({
	args: {
		older: { has: true, isLoading: true, onLoad: fn() },
		children: SCROLLING_TRANSCRIPT,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while a page request is in flight through the layout. Check that the loading half of the contract survives the hop: the control announces itself busy, refuses a second request, and keeps its name and its focus — a keyboard reader who fired it must not be dropped back to the top of the transcript. Pick `OlderMessages` for the idle control.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const loadOlder = canvas.getByRole("button", {
			name: "Load older messages",
		})

		await expect(loadOlder).toHaveAttribute("aria-busy", "true")
		await expect(loadOlder).toHaveAttribute("aria-disabled", "true")

		await userEvent.click(loadOlder)

		await expect(args.older?.onLoad).not.toHaveBeenCalled()
		await expect(loadOlder).toHaveFocus()
	},
})

export const StartOfOlderMessages = meta.story({
	args: { older: { has: false, onLoad: fn() }, children: CONVERSATION },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this once the last page has landed. Check that the control is replaced by the start-of-history copy rather than disappearing — the reader needs to know the history above them is finished, not still loading. Pick `OlderMessages` while pages remain.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("Beginning of the conversation"),
		).toBeVisible()
	},
})

export const Error = meta.story({
	args: {
		header: <AppHeader trailing={<ConnectionStatus state="crashed" />} />,
		notice: (
			<Notice
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

export const Pending = meta.story({
	args: {
		children: SCROLLING_TRANSCRIPT,
		pending: (
			<ToolApproval
				tool="Bash"
				description="Claude wants to clear the build output before rebuilding it."
				parameters={[
					{ id: "command", label: "command", value: "bun run build" },
				]}
				onAllowOnce={fn()}
				onDeny={fn()}
			>
				<ToolApprovalCode code="rm -rf apps/app/dist && bun run build" />
			</ToolApproval>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while the agent waits on an answer. The pending card takes its own row between the notice and the composer, so it is docked to the question it answers instead of scrolling away with the transcript. Check that scrolling the rows above leaves the card on screen, that it sits one notice gap above the composer, and that it holds focus as soon as it appears. Pick `Default` once the answer has been sent.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const card = canvas.getByRole("group")
		const scroller = canvasElement.querySelector(
			'[data-slot="message-scroller"]',
		)

		await expect(card).toHaveFocus()
		await expect(scroller?.contains(card)).toBe(false)
	},
})

export const ForwardedRegion = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The region a conversation occupies, handed back through `rootRef`. A host that has to tell a drop landing on the conversation from one landing beside it asks the element, not the DOM for a `data-slot`. The notice reports what the handed-back element contains: check that it reads *Composer inside*, and that the shell renders exactly as `Default` does — the handle changes nothing about the markup.",
			},
		},
	},
	args: { children: CONVERSATION },
	render: (args) => <RegionProbe {...args} />,
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Composer inside")).toBeVisible()
	},
})
