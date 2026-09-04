// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import "@workspace/ui/lib/i18n"

import { ThreadScreen } from "@/components/thread-screen"
import type { AgentEvent } from "@/lib/agent/contract"
import { createAttachmentsController } from "@/lib/chat/attachments-controller"
import {
	type ChatController,
	createChatController,
} from "@/lib/chat/chat-controller"
import {
	type ChatError,
	chatReducer,
	initialChatState,
} from "@/lib/chat/chat-state"
import { createDraftsController } from "@/lib/chat/drafts-controller"
import type { BotThread, Thread } from "@/lib/chat/thread-contract"
import { createConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import {
	createScriptedDriver,
	type ScriptedDriver,
} from "@/lib/conversations/scripted-driver"
import type { Bot } from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import {
	botIdentity,
	message,
	seatBots,
} from "@/lib/conversations/transcript-fixtures"
import type { Mission, MissionChanged } from "@/lib/missions/mission-contract"
import { missionsTransport } from "@/lib/missions/missions-transport"
import { type FakeLayout, fakeLayout } from "@/lib/perf/fake-layout"
import type { Routine } from "@/lib/routines/routine-contract"
import { routinesTransport } from "@/lib/routines/routines-transport"
import type { ReportedRunsReader } from "@/lib/routines/run-port"
import { triggerSourcesTransport } from "@/lib/routines/trigger-sources-transport"

vi.mock("@/lib/routines/routines-transport", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/routines/routines-transport")>()

	return {
		...actual,
		routinesTransport: {
			...actual.routinesTransport,
			list: vi.fn(),
			update: vi.fn(),
		},
	}
})
vi.mock("@/lib/routines/trigger-sources-transport", () => ({
	triggerSourcesTransport: { sources: vi.fn() },
}))
vi.mock("@/lib/missions/missions-transport", () => ({
	missionsTransport: {
		list: vi.fn(),
		onChanged: vi.fn(),
	},
}))

const listRoutines = vi.mocked(routinesTransport.list)
const updateRoutine = vi.mocked(routinesTransport.update)
const listSources = vi.mocked(triggerSourcesTransport.sources)
const listMissions = vi.mocked(missionsTransport.list)
const listenToMissions = vi.mocked(missionsTransport.onChanged)

const CRASH: ChatError = {
	id: "crashed-0",
	error: { kind: "crashed", code: 1, detail: null },
}

const NO_ERRORS: ChatError[] = []

const CRASH_TITLE = "Claude Code stopped"

const SPAWN_FAILURE: ChatError = {
	id: "spawnFailed-1",
	error: { kind: "spawnFailed", detail: "no binary" },
}

const SPAWN_TITLE = "Claude Code is unavailable"

const PINS_TITLE = "Pinned messages are out of date"

const READ_TITLE = "Earlier messages not loaded"

const SPACE = "personal"

const REPORT_TURN = "t-report"

const REPORT_TEXT = "Two tickets closed."

const ROUTINE_TITLE = "Nightly report"

const CAUSES_TITLE = "Routine reports could not be read"

const CAUSES_SOLO_DESCRIPTION =
	"The thread is intact. What opened each report is missing until the next read."

const BOT_TITLE = "Release manager"

const A_MINUTE = 60_000

const REPORTED: SpokenTurn = {
	turnId: REPORT_TURN,
	text: REPORT_TEXT,
	createdAt: A_MINUTE,
}

const SAID_BEFORE: SpokenTurn = {
	turnId: "t-before",
	text: "the walls hold",
	createdAt: 0,
}

const SAID_AFTER: SpokenTurn = {
	turnId: "t-after",
	text: "and the roof too",
	createdAt: 2 * A_MINUTE,
}

const reportedRunsOf =
	(turnId: string): ReportedRunsReader =>
	async () => [
		{ turnId, routineTitle: ROUTINE_TITLE, triggerSourceId: "schedule" },
	]

const REFUSED_REPORTED_RUNS: ReportedRunsReader = () =>
	Promise.reject(new Error("refused"))

const refusingOlderStore = (): TranscriptStore => {
	const base = createFakeTranscriptStore()
	return {
		...base,
		loadPage: (conversationId, cursor) =>
			cursor
				? Promise.reject(new Error("refused"))
				: Promise.resolve({
						conversationId,
						messages: [message({ conversationId, seq: 2 })],
						hasMore: true,
					}),
	}
}

const stubController = (
	overrides: Partial<ChatController> = {},
): ChatController => ({
	getState: () => initialChatState,
	stateFor: () => initialChatState,
	subscribe: () => () => undefined,
	attach: () => () => undefined,
	check: async () => null,
	start: async () => null,
	preflight: async () => null,
	open: async () => null,
	close: async () => undefined,
	leave: () => undefined,
	redescribe: () => undefined,
	restart: async () => null,
	rotate: async () => null,
	loadOlder: async () => undefined,
	follow: () => undefined,
	send: async () => undefined,
	sendTo: async () => undefined,
	reference: async () => null,
	pin: async () => undefined,
	unpin: async () => undefined,
	pins: async () => [],
	reportRun: async () => "",
	storeAttachments: async () => [],
	stop: async () => undefined,
	discard: () => undefined,
	respond: async () => undefined,
	answer: async () => undefined,
	retry: async () => undefined,
	shutdown: async () => undefined,
	dismissError: () => undefined,
	...overrides,
})

const attachments = createAttachmentsController({
	store: async () => [],
	send: () => true,
})

const botOf = (id: string, name: string): Bot => ({
	...botIdentity({ name }),
	id,
	createdAt: 0,
	changesNothing: false,
	memory: "",
	sectionId: null,
	pinPosition: null,
})

type ThreadFixture = {
	id: string
	name: string
	said: string
	errors?: ChatError[]
	controller?: ChatController
}

const threadOf = ({
	id,
	name,
	said,
	errors = NO_ERRORS,
	controller = stubController(),
}: ThreadFixture): BotThread => ({
	kind: "bot",
	bot: botOf(id, name),
	chat: {
		state: {
			...initialChatState,
			connection: "ready",
			conversationId: `c-${id}`,
			messages: [
				message({
					id: `m-${id}`,
					conversationId: `c-${id}`,
					role: "assistant",
					authorBotId: id,
					content: said,
				}),
			],
			errors,
			errorCount: errors.length,
		},
		controller,
	},
	isSettingsOpen: false,
	isOverlayOpen: false,
	onToggleSettings: () => undefined,
})

const NO_BOT_RECORDS: Bot[] = []

const screenOf = (thread: Thread, bots: Bot[] = NO_BOT_RECORDS) =>
	createElement(ThreadScreen, {
		attachments,
		bots,
		drafts: createDraftsController(),
		readerName: "Reader",
		thread,
	})

const settle = () =>
	act(async () => {
		for (let round = 0; round < 20; round += 1) {
			await Promise.resolve()
		}
	})

const WRITING_STARTED: AgentEvent = {
	type: "messageStarted",
	message: {
		id: "msg-writing",
		role: "assistant",
		text: "",
		completion: "streaming",
		timestamp: 1,
	},
}

const WRITING: AgentEvent[] = [
	WRITING_STARTED,
	{
		type: "messageDelta",
		id: "msg-writing",
		seq: 1,
		text: "the walls hold\n\nand",
	},
]

const FIRST_TOKEN: AgentEvent[] = [
	WRITING_STARTED,
	{ type: "messageDelta", id: "msg-writing", seq: 1, text: "the walls hold" },
]

const BLOCK_CLOSED: AgentEvent[] = [
	{ type: "messageDelta", id: "msg-writing", seq: 2, text: "\n\nand" },
]

const ASKED: AgentEvent[] = [
	{
		type: "questionRequested",
		request: {
			id: "ask-1",
			questions: [
				{
					header: "Which wall",
					question: "Which wall holds?",
					options: [],
					multiSelect: false,
				},
			],
		},
	},
]

const HANDED_TO_ADA: AgentEvent[] = [
	{
		type: "messageStarted",
		message: {
			id: "msg-handover",
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: 1,
		},
	},
	{ type: "messageDelta", id: "msg-handover", seq: 1, text: "@Ada keep going" },
	{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
]

const SAID_AND_LANDED: AgentEvent[] = [
	{
		type: "messageStarted",
		message: {
			id: "msg-said",
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: 1,
		},
	},
	{ type: "messageDelta", id: "msg-said", seq: 1, text: "the walls hold" },
	{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
]

type Room = {
	driver: ScriptedDriver
	bots: Bot[]
	thread: Thread
	idOf: (name: string) => string
	send: (text: string) => Promise<void>
}

type SpokenTurn = {
	turnId: string
	text: string
	createdAt: number
}

type RoomFixture = {
	names: string[]
	readReportedRuns?: ReportedRunsReader
	spoken?: SpokenTurn[]
}

const writeTurn = async (
	store: TranscriptStore,
	conversationId: string,
	botId: string,
	{ turnId, text, createdAt }: SpokenTurn,
) => {
	await store.startTurn({ id: turnId, conversationId, startedAt: createdAt })
	await store.openAssistantMessage({
		id: `m-${turnId}`,
		conversationId,
		turnId,
		authorBotId: botId,
		repliedToMessageId: null,
		createdAt,
	})
	await store.appendText(`m-${turnId}`, text)
	await store.finalizeMessage(`m-${turnId}`, "complete")
	await store.completeTurn(turnId, createdAt)
}

const roomOf = async ({
	names,
	readReportedRuns,
	spoken = [],
}: RoomFixture): Promise<Room> => {
	const store = createFakeTranscriptStore()
	const bots = await seatBots(store, SPACE, names)
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: bots.map((bot) => bot.id),
	})
	for (const turn of spoken) {
		await writeTurn(store, conversation.id, bots[0].id, turn)
	}
	const driver = createScriptedDriver()
	const runtimes = createConversationRuntimes(driver, store, {
		readReportedRuns,
	})
	const controller = runtimes.runtimeFor(conversation.id)

	return {
		driver,
		bots,
		thread: {
			kind: "conversation",
			conversation,
			runtimes,
			isSettingsOpen: false,
			onOpenSettings: () => undefined,
		},
		idOf: (name) => bots.find((bot) => bot.name === name)?.id ?? name,
		send: async (text) => {
			await act(async () => {
				await controller.send(text)
			})
			await settle()
		},
	}
}

const SOLO_ROUTINE: Routine = {
	id: "r-1",
	conversationId: "c-bot-1",
	botId: "bot-1",
	title: "Shift log digest",
	instruction: "Read the shift log and report what changed.",
	triggerSourceId: "schedule",
	filter: { matchMode: "all", rows: [] },
	triggerConfig: { every: "1h" },
	isEnabled: true,
	consecutiveFailures: 0,
	createdAt: 0,
}

const SOLO_MISSION: Mission = {
	id: "m-1",
	originConversationId: "c-bot-1",
	botId: "bot-1",
	threadConversationId: "c-mission-1",
	objective: "Rewrite the changelog parser",
	ticket: {
		platform: "linear",
		externalId: "OPE-42",
		url: "https://linear.app/ope-42",
		title: "Changelog parser",
	},
	tools: ["Read", "Write"],
	state: "working",
	openedAt: 0,
	closedAt: null,
}

const SCHEDULE_SOURCE = {
	id: "schedule",
	title: "Schedule",
	payload: [],
	dedupeKey: "occurrenceId",
}

const ROUTINES_TOGGLE = "Activity"

const READ_ROUTINES_TITLE = "Routines could not be read"

const withoutMainConversation = (thread: BotThread): BotThread => ({
	...thread,
	chat: {
		...thread.chat,
		state: { ...thread.chat.state, conversationId: null },
	},
})

const turnGroups = () =>
	document.querySelectorAll('[data-slot="chat-turn-group"]')

const openRoutinesPanel = async () => {
	fireEvent.click(screen.getByRole("button", { name: ROUTINES_TOGGLE }))
	await settle()
}

type SoloFixture = {
	readReportedRuns?: ReportedRunsReader
	spoken?: SpokenTurn[]
}

type Solo = {
	thread: () => BotThread
	report: (text: string) => Promise<void>
}

const soloOf = async ({
	readReportedRuns,
	spoken = [],
}: SoloFixture): Promise<Solo> => {
	const store = createFakeTranscriptStore()
	const [bot] = await seatBots(store, SPACE, ["Ada"])
	const chat = await store.mainChat(bot.id)
	for (const turn of spoken) {
		await writeTurn(store, chat.id, bot.id, turn)
	}
	const controller = createChatController(createScriptedDriver(), store, {
		readReportedRuns,
	})
	await act(async () => {
		await controller.open(bot.id)
	})

	return {
		thread: () => ({
			kind: "bot",
			bot,
			chat: { state: controller.stateFor(bot.id), controller },
			isSettingsOpen: false,
			isOverlayOpen: false,
			onToggleSettings: () => undefined,
		}),
		report: async (text) => {
			await act(async () => {
				await controller.reportRun({
					conversationId: chat.id,
					botId: bot.id,
					runtimeSessionId: "rs-1",
					text,
					routineTitle: ROUTINE_TITLE,
					triggerSourceId: "schedule",
				})
			})
			await settle()
		},
	}
}

const stopsFor = (name: string) =>
	screen.queryAllByRole("button", { name: `Stop ${name}` })

const stopFor = (name: string) => stopsFor(name)[0] ?? null

describe("ThreadScreen", () => {
	let layout: FakeLayout

	beforeEach(() => {
		layout = fakeLayout()
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([SOLO_ROUTINE])
		listSources.mockResolvedValue([SCHEDULE_SOURCE])
		listMissions.mockResolvedValue({ open: [], done: [] })
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		layout.restore()
	})

	it("opens the routines of a solo bot thread on its main conversation", async () => {
		updateRoutine.mockResolvedValue({ ...SOLO_ROUTINE, isEnabled: false })
		render(screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })))
		await settle()

		await openRoutinesPanel()

		expect(listRoutines).toHaveBeenCalledWith("c-bot-1")
		expect(listSources).toHaveBeenCalledWith("bot-1")
		expect(screen.getByText(SOLO_ROUTINE.title)).toBeTruthy()

		fireEvent.click(screen.getByRole("switch", { name: SOLO_ROUTINE.title }))
		await settle()

		expect(updateRoutine).toHaveBeenCalledWith(
			SOLO_ROUTINE.id,
			expect.objectContaining({ isEnabled: false }),
		)
	})

	it("leaves a solo bot thread with no main conversation without routines", async () => {
		const thread = threadOf({ id: "bot-1", name: "Nyx", said: "held" })
		render(screenOf(withoutMainConversation(thread)))
		await settle()

		expect(screen.queryByRole("button", { name: ROUTINES_TOGGLE })).toBeNull()
		expect(listRoutines).not.toHaveBeenCalled()
		expect(listSources).not.toHaveBeenCalled()
	})

	it("keeps the transcript a solo bot thread mounted when its main conversation arrives", async () => {
		const thread = threadOf({ id: "bot-1", name: "Nyx", said: "held" })
		const { rerender } = render(screenOf(withoutMainConversation(thread)))
		await settle()

		const painted = turnGroups()[0]
		fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[0])
		expect(screen.getByRole("button", { name: "Cancel reply" })).toBeTruthy()

		rerender(screenOf(thread))
		await settle()

		expect(turnGroups()[0]).toBe(painted)
		expect(screen.getByRole("button", { name: "Cancel reply" })).toBeTruthy()
		expect(listRoutines).toHaveBeenCalledWith("c-bot-1")
	})

	it("tells the reader when the routines of a solo bot thread could not be read", async () => {
		listRoutines.mockRejectedValue(new Error("refused"))
		render(screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })))
		await settle()

		await openRoutinesPanel()
		expect(screen.getByText(READ_ROUTINES_TITLE)).toBeTruthy()

		listRoutines.mockResolvedValue([SOLO_ROUTINE])
		fireEvent.click(screen.getByRole("button", { name: "Retry" }))
		await settle()

		expect(screen.getByText(SOLO_ROUTINE.title)).toBeTruthy()
	})

	it("reads the missions of a solo bot thread again when one of them changes", async () => {
		const announce: { toPanel: ((changed: MissionChanged) => void) | null } = {
			toPanel: null,
		}
		listenToMissions.mockImplementation((listener) => {
			announce.toPanel = listener
			return Promise.resolve(() => undefined)
		})
		listMissions.mockResolvedValue({ open: [SOLO_MISSION], done: [] })
		render(screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })))
		await settle()

		await openRoutinesPanel()
		expect(listMissions).toHaveBeenCalledWith("c-bot-1")
		expect(screen.getByText(SOLO_MISSION.objective)).toBeTruthy()

		announce.toPanel?.({ missionId: SOLO_MISSION.id, state: "waiting_human" })
		await settle()

		expect(listMissions).toHaveBeenCalledTimes(2)
	})

	it("tells the reader when the missions of a solo bot thread could not be read", async () => {
		listMissions.mockRejectedValue(new Error("refused"))
		render(screenOf(threadOf({ id: "bot-1", name: "Nyx", said: "held" })))
		await settle()

		await openRoutinesPanel()
		expect(screen.getByText(READ_ROUTINES_TITLE)).toBeTruthy()

		listMissions.mockResolvedValue({ open: [], done: [] })
		fireEvent.click(screen.getByRole("button", { name: "Retry" }))
		await settle()

		expect(screen.queryByText(READ_ROUTINES_TITLE)).toBeNull()
		expect(screen.getByText(SOLO_ROUTINE.title)).toBeTruthy()
	})

	it("forgets the reply target of the thread left behind", async () => {
		const first = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
		})
		const second = threadOf({
			id: "bot-2",
			name: "Vex",
			said: "the second answer",
		})
		const { rerender } = render(screenOf(first))
		await settle()

		fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[0])
		expect(screen.getByRole("button", { name: "Cancel reply" })).toBeTruthy()

		rerender(screenOf(second))
		await settle()

		expect(screen.queryByRole("button", { name: "Cancel reply" })).toBeNull()
	})

	it("drops the pages of the solo thread left behind for a conversation", async () => {
		const left: string[] = []
		const thread = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			controller: stubController({
				leave: (botId) => {
					left.push(botId)
				},
			}),
		})
		const room = await roomOf({ names: ["Ada"] })
		const { rerender } = render(screenOf(thread))
		await settle()
		expect(left).toEqual([])

		rerender(screenOf(room.thread))
		await settle()

		expect(left).toEqual(["bot-1"])
	})

	it("reads back the reason a session died, and the bare exit code when it left none", async () => {
		const refusal = "refusing to start: the credentials file is unreadable"
		const reported: ChatError = {
			id: "crashed-1",
			error: { kind: "crashed", code: 1, detail: refusal },
		}

		const { unmount } = render(
			screenOf(
				threadOf({ id: "bot-1", name: "Nyx", said: "hi", errors: [reported] }),
			),
		)
		await settle()

		expect(
			screen.getByText(`Claude Code exited (code 1). ${refusal}`),
		).toBeTruthy()

		unmount()
		const withoutCode: ChatError = {
			id: "crashed-2",
			error: { kind: "crashed", code: null, detail: refusal },
		}
		const { unmount: unmountUnknown } = render(
			screenOf(
				threadOf({
					id: "bot-1",
					name: "Nyx",
					said: "hi",
					errors: [withoutCode],
				}),
			),
		)
		await settle()

		expect(
			screen.getByText(`Claude Code exited (code unknown). ${refusal}`),
		).toBeTruthy()

		unmountUnknown()
		render(
			screenOf(
				threadOf({ id: "bot-1", name: "Nyx", said: "hi", errors: [CRASH] }),
			),
		)
		await settle()

		expect(screen.getByText("Claude Code exited (code 1).")).toBeTruthy()
	})

	it("leaves a dismissed bot failure dismissed when the reader returns", async () => {
		const opened = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			errors: [CRASH],
		})
		let state = opened.chat.state
		const controller = stubController({
			dismissError: (id) => {
				state = chatReducer(state, { type: "errorDismissed", id })
			},
		})
		const shown = (): BotThread => ({ ...opened, chat: { state, controller } })
		const { unmount } = render(screenOf(shown()))
		await settle()

		expect(screen.getByText(CRASH_TITLE)).toBeTruthy()

		fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }))
		unmount()
		render(screenOf(shown()))
		await settle()

		expect(screen.queryByText(CRASH_TITLE)).toBeNull()
	})

	it("shows the failure that came after the one the reader dismissed", async () => {
		const dismissed = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			errors: [CRASH],
		})
		const later = chatReducer(dismissed.chat.state, {
			type: "errorDismissed",
			id: CRASH.id,
		})

		render(
			screenOf({
				...dismissed,
				chat: {
					...dismissed.chat,
					state: { ...later, errors: [SPAWN_FAILURE] },
				},
			}),
		)
		await settle()

		expect(screen.getByText(SPAWN_TITLE)).toBeTruthy()
	})

	it("leaves a dismissed conversation failure dismissed when the reader returns", async () => {
		const store = refusingOlderStore()
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: [],
		})
		const runtimes = createConversationRuntimes(createScriptedDriver(), store)
		const thread: Thread = {
			kind: "conversation",
			conversation,
			runtimes,
			isSettingsOpen: false,
			onOpenSettings: () => undefined,
		}
		const { unmount } = render(screenOf(thread))
		await settle()

		fireEvent.click(screen.getByRole("button", { name: "Load older messages" }))
		await settle()
		expect(screen.getByText(READ_TITLE)).toBeTruthy()

		fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }))
		expect(screen.queryByText(READ_TITLE)).toBeNull()

		unmount()
		render(screenOf(thread))
		await settle()

		expect(screen.queryByText(READ_TITLE)).toBeNull()
	})

	it("tells the reader when the pinned messages could not be read", async () => {
		const thread = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			controller: stubController({
				pins: () => Promise.reject(new Error("refused")),
			}),
		})
		render(screenOf(thread))
		await settle()

		expect(screen.getByText(PINS_TITLE)).toBeTruthy()

		fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }))

		expect(screen.queryByText(PINS_TITLE)).toBeNull()
	})

	it("writes the title of the bot record next to the author of that bot id", async () => {
		const room = await roomOf({ names: ["Ada"], spoken: [SAID_BEFORE] })
		render(
			screenOf(
				room.thread,
				room.bots.map((bot) => ({ ...bot, title: BOT_TITLE })),
			),
		)
		await settle()

		expect(screen.getByText(SAID_BEFORE.text)).toBeTruthy()
		expect(screen.getByText(BOT_TITLE)).toBeTruthy()
	})

	it("leaves the author of a participant no bot record matches with no title", async () => {
		const room = await roomOf({ names: ["Ada"], spoken: [SAID_BEFORE] })
		render(
			screenOf(room.thread, [
				{ ...room.bots[0], id: "bot-elsewhere", title: BOT_TITLE },
			]),
		)
		await settle()

		expect(screen.getByText(SAID_BEFORE.text)).toBeTruthy()
		expect(screen.queryByText(BOT_TITLE)).toBeNull()
	})

	it("names the routine on the turn its report opened", async () => {
		const room = await roomOf({
			names: ["Ada"],
			spoken: [REPORTED],
			readReportedRuns: reportedRunsOf(REPORT_TURN),
		})
		render(screenOf(room.thread))
		await settle()

		expect(screen.getByText(REPORT_TEXT)).toBeTruthy()
		expect(screen.getByText(ROUTINE_TITLE)).toBeTruthy()
	})

	it("leaves a turn outside the reported runs with no routine line", async () => {
		const room = await roomOf({
			names: ["Ada"],
			spoken: [REPORTED],
			readReportedRuns: reportedRunsOf("t-elsewhere"),
		})
		render(screenOf(room.thread))
		await settle()

		expect(screen.getByText(REPORT_TEXT)).toBeTruthy()
		expect(screen.queryByText(ROUTINE_TITLE)).toBeNull()
	})

	it("keeps the transcript and reports a failed read of the reported runs", async () => {
		const room = await roomOf({
			names: ["Ada"],
			spoken: [REPORTED],
			readReportedRuns: REFUSED_REPORTED_RUNS,
		})
		render(createElement(NoticeSurface))
		render(screenOf(room.thread))
		await settle()

		expect(screen.getByText(REPORT_TEXT)).toBeTruthy()
		expect(screen.queryByText(ROUTINE_TITLE)).toBeNull()
		expect(screen.getAllByText(CAUSES_TITLE).length).toBeGreaterThan(0)
	})

	it("names the routine on a report a minute after a message of the same bot", async () => {
		const room = await roomOf({
			names: ["Ada"],
			spoken: [SAID_BEFORE, REPORTED, SAID_AFTER],
			readReportedRuns: reportedRunsOf(REPORT_TURN),
		})
		render(screenOf(room.thread))
		await settle()

		const opened = screen
			.getByText(ROUTINE_TITLE)
			.closest('[data-slot="chat-turn-group"]')

		expect(opened?.textContent).toContain(REPORT_TEXT)
		expect(opened?.textContent).not.toContain(SAID_BEFORE.text)
		expect(opened?.textContent).not.toContain(SAID_AFTER.text)
		expect(screen.getByText(SAID_AFTER.text)).toBeTruthy()
	})

	it("raises one notice however many times the reader enters on a failing read", async () => {
		const room = await roomOf({
			names: ["Ada"],
			spoken: [REPORTED],
			readReportedRuns: REFUSED_REPORTED_RUNS,
		})
		render(createElement(NoticeSurface))
		const { unmount } = render(screenOf(room.thread))
		await settle()
		const raised = screen.getAllByText(CAUSES_TITLE).length

		unmount()
		render(screenOf(room.thread))
		await settle()

		expect(screen.getAllByText(CAUSES_TITLE)).toHaveLength(raised)
	})

	it("names the routine on the report turn of a solo thread", async () => {
		const solo = await soloOf({
			spoken: [REPORTED],
			readReportedRuns: reportedRunsOf(REPORT_TURN),
		})
		render(screenOf(solo.thread()))
		await settle()

		expect(screen.getByText(REPORT_TEXT)).toBeTruthy()
		expect(screen.getByText(ROUTINE_TITLE)).toBeTruthy()
	})

	it("shows a report written while the solo thread is open", async () => {
		const solo = await soloOf({ spoken: [SAID_BEFORE] })
		const { rerender } = render(screenOf(solo.thread()))
		await settle()

		expect(screen.queryByText(REPORT_TEXT)).toBeNull()

		await solo.report(REPORT_TEXT)
		rerender(screenOf(solo.thread()))
		await settle()

		expect(screen.getByText(REPORT_TEXT)).toBeTruthy()
		expect(screen.getByText(ROUTINE_TITLE)).toBeTruthy()
	})

	it("keeps the solo transcript and reports a failed read of the runs", async () => {
		render(createElement(NoticeSurface))
		const solo = await soloOf({
			spoken: [REPORTED],
			readReportedRuns: REFUSED_REPORTED_RUNS,
		})
		render(screenOf(solo.thread()))
		await settle()

		expect(screen.getByText(REPORT_TEXT)).toBeTruthy()
		expect(screen.queryByText(ROUTINE_TITLE)).toBeNull()
		expect(screen.getAllByText(CAUSES_TITLE).length).toBeGreaterThan(0)
		expect(screen.getAllByText(CAUSES_SOLO_DESCRIPTION).length).toBeGreaterThan(
			0,
		)
	})

	it("stops the bot whose working row carries the stop, and no other", async () => {
		const room = await roomOf({ names: ["Ada", "Nyx"] })
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada @Nyx now")

		expect(stopFor("Nyx")).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: "Stop Ada" }))
		await settle()

		expect(room.driver.cancelled).toEqual([room.idOf("Ada")])
		expect(stopFor("Nyx")).toBeTruthy()
	})

	it("leaves no stop on the waiting row of a bot holding no seat", async () => {
		const room = await roomOf({ names: ["Ada", "Nyx"] })
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada now")
		await room.send("@Nyx after")

		expect(stopFor("Ada")).toBeTruthy()
		expect(stopFor("Nyx")).toBeNull()
	})

	it("carries the stop onto the run a speaking bot is writing", async () => {
		const room = await roomOf({ names: ["Ada"] })
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), WRITING)
		})
		await settle()

		expect(screen.getByText("the walls hold")).toBeTruthy()
		fireEvent.click(stopsFor("Ada")[0])
		await settle()

		expect(room.driver.cancelled).toEqual([room.idOf("Ada")])
	})

	it("holds a seated bot on its waiting row until it publishes a block", async () => {
		const room = await roomOf({ names: ["Ada"] })
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), FIRST_TOKEN)
		})
		await settle()

		expect(screen.queryByText("the walls hold")).toBeNull()
		expect(screen.getByText("Ada is thinking…")).toBeTruthy()
		expect(stopFor("Ada")).toBeTruthy()
	})

	it("keeps the working row of a seated bot that has published a block", async () => {
		const room = await roomOf({ names: ["Ada"] })
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), FIRST_TOKEN)
			room.driver.pushTo(room.idOf("Ada"), BLOCK_CLOSED)
		})
		await settle()

		expect(screen.getByText("the walls hold")).toBeTruthy()
		expect(screen.getByText("Ada is writing…")).toBeTruthy()

		fireEvent.click(stopsFor("Ada")[1])
		await settle()

		expect(room.driver.cancelled).toEqual([room.idOf("Ada")])
	})

	it("keeps the working row of a bot asking after it published a block", async () => {
		const room = await roomOf({ names: ["Ada"] })
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), FIRST_TOKEN)
			room.driver.pushTo(room.idOf("Ada"), BLOCK_CLOSED)
			room.driver.pushTo(room.idOf("Ada"), ASKED)
		})
		await settle()

		expect(screen.getByText("Ada · Which wall")).toBeTruthy()
	})

	it("draws one row for a speaking bot another speaker hands over to", async () => {
		const room = await roomOf({ names: ["Ada", "Nyx"] })
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada @Nyx now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), FIRST_TOKEN)
			room.driver.pushTo(room.idOf("Ada"), BLOCK_CLOSED)
			room.driver.pushTo(room.idOf("Nyx"), HANDED_TO_ADA)
		})
		await settle()

		expect(screen.getAllByText(/^Ada is /)).toHaveLength(1)
		expect(screen.getByText("Ada is writing…")).toBeTruthy()
	})

	it("leaves no stop on the turn a bot has landed", async () => {
		const room = await roomOf({ names: ["Ada"] })
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), SAID_AND_LANDED)
		})
		await settle()

		expect(screen.getByText("the walls hold")).toBeTruthy()
		expect(screen.queryByText("Ada is writing…")).toBeNull()
		expect(stopFor("Ada")).toBeNull()
	})

	it("stops the solo bot from the row it works on", async () => {
		const thread = threadOf({ id: "bot-1", name: "Nyx", said: "the answer" })
		const cancelled: string[] = []
		render(
			screenOf({
				...thread,
				chat: {
					state: { ...thread.chat.state, turn: "running" },
					controller: stubController({
						stop: async () => {
							cancelled.push("Nyx")
						},
					}),
				},
			}),
		)
		await settle()

		fireEvent.click(screen.getByRole("button", { name: "Stop Nyx" }))
		await settle()

		expect(cancelled).toEqual(["Nyx"])
	})
})
