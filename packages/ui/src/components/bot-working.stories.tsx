import { useState } from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	botIdentityAvatars,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import type { AgentActivityItem } from "@workspace/ui/components/agent-activity"
import { AgentActivity } from "@workspace/ui/components/agent-activity"
import { BLOT_TINTS, BotAvatar } from "@workspace/ui/components/bot-avatar"
import { ANIMALS } from "@workspace/ui/components/bot-avatar-animals"
import {
	BotWorking,
	type BotWorkingKind,
} from "@workspace/ui/components/bot-working"
import { Button } from "@workspace/ui/components/button"
import { ChatMarkProvider } from "@workspace/ui/components/chat-mark-context"
import {
	AssistantTurn,
	CHAT_AVATAR_SIZE,
	UserTurn,
} from "@workspace/ui/components/chat-turn"

const BUSY_BOT = { animal: "owl", blot: "blue", seed: "bot-7" } as const

const ROOM_BOTS = [
	{ botId: "bot-lyra", name: "Lyra", animal: "owl", blot: "blue" },
	{ botId: "bot-orion", name: "Orion", animal: "cat", blot: "orange" },
	{ botId: "bot-vega", name: "Vega", animal: "rabbit", blot: "purple" },
] as const

const [SPEAKING_BOT, ...WAITING_BOTS] = ROOM_BOTS

const MARKED_BOT_ID = SPEAKING_BOT.botId

const ROOMS = [
	{
		id: "room-standup",
		bot: ROOM_BOTS[0],
		prompts: ["Where did we land on the mark?"],
	},
	{
		id: "room-release",
		bot: ROOM_BOTS[1],
		prompts: [
			"What is left before the release?",
			"And who is holding the changelog?",
			"Anything blocked on the host?",
		],
	},
] as const

const BOT_WORKING_KINDS: BotWorkingKind[] = [
	"thinking",
	"searching",
	"working",
	"writing",
	"waiting",
]

const ANSWER =
	"Two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell. Nothing crosses that line the other way."

const ACTIVITY: AgentActivityItem[] = [
	{ id: "read", type: "tool", action: "read", target: "AGENTS.md" },
	{ id: "grep", type: "tool", action: "run", target: "rg packages" },
	{ id: "sum", type: "trace", kind: "thinking", label: "Two workspaces" },
]

const MarkHandoff = () => {
	const [delivered, setDelivered] = useState(false)

	return (
		<ChatMarkProvider>
			<div className="mx-auto flex max-w-2xl flex-col gap-6">
				<Button
					size="sm"
					variant="outline"
					className="self-start"
					onClick={() => setDelivered(!delivered)}
				>
					{delivered ? "Rewind to working" : "Land the turn"}
				</Button>
				<AssistantTurn
					botId={MARKED_BOT_ID}
					carriesMark
					state={delivered ? "complete" : "streaming"}
					copyText={delivered ? ANSWER : undefined}
					avatar={
						delivered ? (
							<BotAvatar animated={false} size={CHAT_AVATAR_SIZE} />
						) : null
					}
				>
					{ANSWER}
				</AssistantTurn>
				<AgentActivity
					items={ACTIVITY}
					status={delivered ? "complete" : "working"}
					renderWorkingStatus={() => (
						<BotWorking
							botId={MARKED_BOT_ID}
							kind="working"
							label="Bash · rg packages"
						/>
					)}
				/>
			</div>
		</ChatMarkProvider>
	)
}

const RoomWorkers = () => (
	<ChatMarkProvider transcriptKey={ROOMS[0].id}>
		<div className="flex flex-col gap-4">
			<BotWorking {...SPEAKING_BOT} kind="working" seed={SPEAKING_BOT.botId} />
			{WAITING_BOTS.map((bot) => (
				<BotWorking {...bot} key={bot.botId} kind="waiting" seed={bot.botId} />
			))}
			<BotWorking kind="waiting" name="Unknown" />
		</div>
	</ChatMarkProvider>
)

const ConversationSwap = () => {
	const [isSecond, setIsSecond] = useState(false)
	const room = isSecond ? ROOMS[1] : ROOMS[0]

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<Button
				size="sm"
				variant="outline"
				className="self-start"
				onClick={() => setIsSecond(!isSecond)}
			>
				Open the other conversation
			</Button>
			<ChatMarkProvider transcriptKey={room.id}>
				<div className="flex flex-col gap-4">
					{room.prompts.map((prompt) => (
						<UserTurn key={prompt}>{prompt}</UserTurn>
					))}
					<BotWorking {...room.bot} kind="thinking" seed={room.bot.botId} />
				</div>
			</ChatMarkProvider>
		</div>
	)
}

const meta = preview.meta({
	title: "Feedback/BotWorking",
	component: BotWorking,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"What the transcript shows while the bot is busy: its avatar, alone, in the pose that matches the work. The avatar is also the stop control — given `onStop`, pointing at it or reaching it by keyboard covers the animal with a stop glyph, so the composer below stays free for the next prompt. The words only appear while the reader points at the avatar — timed kinds add a clock to them, untimed ones only shimmer. The kind comes from the running tool, so reading turns the avatar to `searching` and a shell command to `working`. Nothing here polls the transport; a screen maps its own state onto `kind` and `label`. Inside a transcript the avatar is understood to be the same mark the `AssistantTurn` gutter shows once the turn lands, so it travels there rather than being replaced — give both rows the same `botId` and it does, within that one conversation. See `Mark`, `MarkPerBot` for a room where several bots are busy at once, and `ConversationChange` for what a swapped conversation does to them.",
			},
		},
	},
	args: { kind: "thinking", name: "No name" },
	argTypes: {
		kind: { control: "select", options: BOT_WORKING_KINDS },
		botId: { control: "text" },
		animal: { control: "select", options: Object.keys(ANIMALS) },
		blot: { control: "select", options: [undefined, ...BLOT_TINTS] },
		seed: { control: "text" },
		size: { control: { type: "range", min: 20, max: 64, step: 2 } },
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to audition a kind with its own label, as a tool would supply. Check that the avatar pose changes with the kind and that only `searching` and `working` add a running clock.",
			},
		},
	},
})

export const Variants = meta.story({
	render: () => (
		<div className="flex flex-col gap-4">
			{BOT_WORKING_KINDS.map((kind) => (
				<BotWorking key={kind} kind={kind} />
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every kind of work, in the order a turn tends to walk through them, at rest — which is how the transcript shows them. Check that each pose reads differently at avatar size without any words to lean on. Pick `HoverLabel` for what pointing at one says.",
			},
		},
	},
})

export const Blot = meta.story({
	args: { animal: "rabbit", blot: "blue" },
	render: (args) => (
		<div className="flex flex-col gap-4">
			<BotWorking {...args} blot={undefined} />
			{BOT_WORKING_KINDS.map((kind) => (
				<BotWorking {...args} key={kind} kind={kind} />
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The tint a bot was marked with, held through every kind of work. The first row carries none and draws the bare animal; the rest carry the same blot, untouched by the work. Pick `Branding/BotIdentityAvatar → EveryBlot` for the eight tints themselves.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [bare, ...tinted] = botIdentityAvatars(canvasElement)

		await expect(bare.querySelector('[data-slot="bot-avatar-blot"]')).toBeNull()
		for (const avatar of tinted) {
			await expect(
				avatar
					.querySelector('[data-slot="bot-avatar-blot"]')
					?.getAttribute("fill"),
			).toBe("var(--bot-blot-blue)")
		}
	},
})

export const WithTool = meta.story({
	args: { kind: "working", label: "Bash · npm test" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when a tool is running: on hover the label names the step itself rather than a verb, and the clock says how long it has been going. Check that the elapsed time keeps counting behind the fade and that a long tool title does not push the row past the column.",
			},
		},
	},
})

export const Mark = meta.story({
	render: () => <MarkHandoff />,
	parameters: {
		docs: {
			description: {
				story:
					"The second place a mark can leave from: an `AgentActivity` header, when the row that receives it is already on screen. Only the mark moves — the header settles into its summary and the bubble stays put. Pick `AI/ChatTurn → Mark` for the handoff itself and what the receiving row does.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const marks = () =>
			canvasElement.querySelectorAll('[data-slot="shared-mark"]')

		await expect(marks()).toHaveLength(1)

		await userEvent.click(canvas.getByRole("button", { name: "Land the turn" }))
		await waitFor(() =>
			expect(
				canvas.getByRole("button", { name: /Completed 3 steps/ }),
			).toBeVisible(),
		)

		await expect(marks()).toHaveLength(1)
	},
})

export const MarkPerBot = meta.story({
	render: () => <RoomWorkers />,
	parameters: {
		docs: {
			description: {
				story:
					"A room where several bots are busy at once: one is speaking and the others are waiting their turn. Each row is told which bot it draws, so each holds a mark of its own and lands in its own gutter when its answer arrives — one mark shared between them would put every waiting bot on the speaking bot's row. The last row names no bot, which is what a transcript that cannot name the worker gets: a plain slot that never travels. Check that every named row carries a different mark and that the unnamed one carries none.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const marks = slotsIn(canvasElement, "shared-mark")
		const named = marks.slice(0, -1).map((mark) => mark.dataset.mark)

		await expect(new Set(named).size).toBe(ROOM_BOTS.length)
		await expect(marks.at(-1)).toHaveAttribute("data-state", "plain")
	},
})

export const ConversationChange = meta.story({
	render: () => <ConversationSwap />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the host swaps the conversation under a chat it keeps mounted, which is what a workspace does when the reader opens another room. A mark is named by its bot and its transcript together, so the swap draws a different mark rather than moving the one left behind: check that the working row of the second conversation appears where it belongs, with no avatar gliding across the window from where the first one stood.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const mark = () => slotsIn(canvasElement, "shared-mark")[0]
		const left = mark()
		const leftName = left.getAttribute("data-mark")
		const leftTop = left.getBoundingClientRect().top

		await userEvent.click(
			canvas.getByRole("button", { name: "Open the other conversation" }),
		)

		const opened = mark()

		await expect(opened).not.toBe(left)
		await expect(opened.getAttribute("data-mark")).not.toBe(leftName)
		await expect(getComputedStyle(opened).transform).toBe("none")
		await expect(opened.getBoundingClientRect().top).not.toBe(leftTop)
	},
})

export const HoverLabel = meta.story({
	args: { kind: "searching" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to check the hover affordance: the row is only an avatar until the reader points at it, and the words that fade in name who is busy and at what. Check that nothing shifts as they appear — the text holds its place while invisible, and screen readers get it either way.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const text = canvas.getByText("No name is searching…")

		await waitFor(() => expect(text).not.toBeVisible())
		await userEvent.hover(canvas.getByRole("img"))
		await waitFor(() => expect(text).toBeVisible())
	},
})

export const Marked = meta.story({
	args: { ...BUSY_BOT, kind: "searching", name: "Atlas" },
	render: (args) => (
		<div className="flex flex-col gap-4">
			{BOT_WORKING_KINDS.map((kind) => (
				<BotWorking {...args} key={kind} kind={kind} />
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The bot doing the work, wearing exactly what it wears at rest: its own animal, its own tint, and the blot shape its id lands on. A run may change the pose and nothing else — a working row that dropped the tint or reposed the blot would put a different bot on the screen at the one moment the reader is watching it. Check that the mark is identical across all five kinds and against the roster row for the same bot, and that only the animal inside it moves.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [thinking, ...rest] = slotsIn(canvasElement, "bot-avatar-blot")

		await expect(rest).toHaveLength(BOT_WORKING_KINDS.length - 1)
		for (const blot of rest) {
			await expect(blot.getAttribute("fill")).toBe(
				thinking.getAttribute("fill"),
			)
			await expect(blot.getAttribute("transform")).toBe(
				thinking.getAttribute("transform"),
			)
		}
	},
})

export const Stop = meta.story({
	args: {
		...BUSY_BOT,
		kind: "working",
		name: "Atlas",
		label: "Bash · npm test",
		onStop: fn(),
	},
	render: (args) => (
		<div className="flex flex-col gap-4">
			<BotWorking {...args} />
			<BotWorking {...args} image={UPLOADED_AVATAR_IMAGE} />
			<BotWorking {...args} onStop={undefined} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Interrupting the run, from the row that is running it: the first two avatars take `onStop` and become controls, the last takes none and stays a drawing. Check that the veil covers the drawn avatar corner to corner and holds to the circle of the uploaded picture, that it appears the instant the avatar is pointed at with no fade — pointing at the words beside it reveals them and nothing else — that Tab reaches each control and lights the same glyph, and that the last row exposes no button at all.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const [stop, uploaded] = canvas.getAllByRole("button", {
			name: "Stop Atlas",
		})
		const [glyph, uploadedGlyph] = slotsIn(
			canvasElement,
			"bot-working-stop-glyph",
		)
		const label = canvas.getAllByText("Atlas · Bash · npm test")[0]

		await expect(canvas.getAllByRole("button")).toHaveLength(2)
		await expect(glyph).not.toHaveClass("rounded-full")
		await expect(uploadedGlyph).toHaveClass("rounded-full")

		await userEvent.hover(uploaded)
		await waitFor(() => expect(uploadedGlyph).toBeVisible())
		await userEvent.unhover(uploaded)

		stop.blur()
		await userEvent.hover(stop)
		await waitFor(() => expect(glyph).toBeVisible())

		await userEvent.hover(label)
		await waitFor(() => expect(label).toBeVisible())
		await waitFor(() => expect(glyph).not.toBeVisible())

		await userEvent.tab()
		await expect(stop).toHaveFocus()
		await waitFor(() => expect(glyph).toBeVisible())

		await userEvent.click(stop)
		await expect(args.onStop).toHaveBeenCalledTimes(1)
	},
})
