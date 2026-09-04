// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import "@workspace/ui/lib/i18n"

import { WorkspaceBody } from "@/components/workspace-body"
import { createAttachmentsController } from "@/lib/chat/attachments-controller"
import { createChatController } from "@/lib/chat/chat-controller"
import { initialChatState } from "@/lib/chat/chat-state"
import { createDraftsController } from "@/lib/chat/drafts-controller"
import { createConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import {
	createScriptedDriver,
	type ScriptedDriver,
} from "@/lib/conversations/scripted-driver"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { seatBots } from "@/lib/conversations/transcript-fixtures"
import type {
	Mission,
	MissionChanged,
	MissionDetail,
	MissionEvent,
} from "@/lib/missions/mission-contract"
import { missionsTransport } from "@/lib/missions/missions-transport"
import { type FakeLayout, fakeLayout } from "@/lib/perf/fake-layout"
import { routinesTransport } from "@/lib/routines/routines-transport"
import { triggerSourcesTransport } from "@/lib/routines/trigger-sources-transport"

vi.mock("@/lib/routines/routines-transport", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/routines/routines-transport")>()

	return {
		...actual,
		routinesTransport: { ...actual.routinesTransport, list: vi.fn() },
	}
})
vi.mock("@/lib/routines/trigger-sources-transport", () => ({
	triggerSourcesTransport: { sources: vi.fn() },
}))
vi.mock("@/lib/missions/missions-transport", () => ({
	missionsTransport: {
		list: vi.fn(),
		detail: vi.fn(),
		onChanged: vi.fn(),
	},
}))

const listRoutines = vi.mocked(routinesTransport.list)
const listSources = vi.mocked(triggerSourcesTransport.sources)
const listMissions = vi.mocked(missionsTransport.list)
const readMission = vi.mocked(missionsTransport.detail)
const listenToMissions = vi.mocked(missionsTransport.onChanged)

const SPACE = "personal"

const THREAD_CONVERSATION = "c-mission-1"

const OBJECTIVE = "Rewrite the changelog parser"

const ACTIVITY = "Activity"

const A_MINUTE = 60_000

const READ_FAILURE_TITLE = "The mission could not be read"

const SEND_FAILURE_TITLE = "The answer did not reach the bot"

const missionOf = (bot: Bot, origin: Conversation): Mission => ({
	id: "m-1",
	originConversationId: origin.id,
	botId: bot.id,
	threadConversationId: THREAD_CONVERSATION,
	objective: OBJECTIVE,
	ticket: {
		platform: "linear",
		externalId: "OPE-42",
		url: "https://linear.app/ope-42",
		title: "Changelog parser",
	},
	tools: ["Read"],
	state: "waiting_human",
	openedAt: 0,
	closedAt: null,
})

const eventOf = (
	kind: MissionEvent["kind"],
	createdAt: number,
	payload: unknown = null,
): MissionEvent => ({
	id: `e-${kind}-${createdAt}`,
	missionId: "m-1",
	kind,
	source: "linear",
	payload,
	createdAt,
})

const attachments = createAttachmentsController({
	store: async () => [],
	send: () => true,
})

type Workspace = {
	bot: Bot
	conversation: Conversation
	driver: ScriptedDriver
	store: TranscriptStore
	body: () => ReturnType<typeof createElement>
}

const workspaceOf = async (store = createFakeTranscriptStore()) => {
	const [bot] = await seatBots(store, SPACE, ["Nyx"])
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: [bot.id],
	})
	const driver = createScriptedDriver()
	const runtimes = createConversationRuntimes(driver, store)
	const chatController = createChatController(createScriptedDriver(), store)

	const workspace: Workspace = {
		bot,
		conversation,
		driver,
		store,
		body: () =>
			createElement(WorkspaceBody, {
				attachments,
				bots: [bot],
				chat: { state: initialChatState, controller: chatController },
				conversation,
				conversationRuntimes: runtimes,
				drafts: createDraftsController(),
				haveSpacesFailed: false,
				isConversationSettingsOpen: false,
				isOverlayOpen: false,
				isSettingsOpen: false,
				onOpenConversationSettings: () => undefined,
				onRetrySpaces: () => undefined,
				onToggleSettings: () => undefined,
				readerName: "Reader",
			}),
	}

	return workspace
}

const settle = () =>
	act(async () => {
		for (let round = 0; round < 20; round += 1) {
			await Promise.resolve()
		}
	})

const openMission = async () => {
	fireEvent.click(screen.getByRole("button", { name: ACTIVITY }))
	await settle()
	fireEvent.click(screen.getByRole("button", { name: new RegExp(OBJECTIVE) }))
	await settle()
}

const missionHeader = () =>
	document.querySelector('[data-slot="mission-header"]')

const feedLines = () =>
	[...document.querySelectorAll('[data-slot="mission-feed"] > li')].map(
		(row) => row.textContent ?? "",
	)

const answer = async (text: string) => {
	const composer = screen.getByRole("textbox")
	fireEvent.change(composer, { target: { value: text } })
	fireEvent.keyDown(composer, { key: "Enter" })
	await settle()
}

describe("WorkspaceBody missions", () => {
	let layout: FakeLayout

	beforeEach(async () => {
		layout = fakeLayout()
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([])
		listSources.mockResolvedValue([])
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		layout.restore()
	})

	const seed = async (
		detail: (mission: Mission) => MissionDetail,
		store?: TranscriptStore,
	) => {
		const workspace = await workspaceOf(store)
		const mission = missionOf(workspace.bot, workspace.conversation)
		listMissions.mockResolvedValue({ open: [mission], done: [] })
		readMission.mockResolvedValue(detail(mission))
		return { workspace, mission }
	}

	it("replaces the thread with the mission opened from the activity panel", async () => {
		const { workspace } = await seed((mission) => ({
			mission,
			events: [eventOf("opened", 0)],
		}))
		render(workspace.body())
		await settle()

		await openMission()

		expect(readMission).toHaveBeenCalledWith("m-1")
		expect(missionHeader()?.textContent).toContain("OPE-42")
		expect(missionHeader()?.textContent).toContain("Waiting for you")
	})

	it("shows the events of the mission and the messages of its thread oldest first", async () => {
		const store = createFakeTranscriptStore()
		await store.startTurn({
			id: "t-1",
			conversationId: THREAD_CONVERSATION,
			startedAt: A_MINUTE,
		})
		await store.appendUserMessage({
			id: "m-said",
			conversationId: THREAD_CONVERSATION,
			turnId: "t-1",
			authorBotId: null,
			repliedToMessageId: null,
			content: "Take the second option.",
			createdAt: A_MINUTE,
		})
		const { workspace } = await seed(
			(mission) => ({
				mission,
				events: [
					eventOf("opened", 0),
					eventOf("escalated", 2 * A_MINUTE, {
						text: "The parser needs a decision.",
					}),
				],
			}),
			store,
		)
		render(workspace.body())
		await settle()

		await openMission()

		const lines = feedLines()
		expect(lines).toHaveLength(3)
		expect(lines[0]).toContain("Mission opened")
		expect(lines[1]).toContain("Take the second option.")
		expect(lines[1]).toContain("Reader")
		expect(lines[2]).toContain("The parser needs a decision.")
	})

	it("reads an answer of the thread as a note of the owning bot", async () => {
		const store = createFakeTranscriptStore()
		const { workspace } = await seed(
			(mission) => ({ mission, events: [] }),
			store,
		)
		await store.startTurn({
			id: "t-1",
			conversationId: THREAD_CONVERSATION,
			startedAt: A_MINUTE,
		})
		await store.openAssistantMessage({
			id: "m-noted",
			conversationId: THREAD_CONVERSATION,
			turnId: "t-1",
			authorBotId: workspace.bot.id,
			repliedToMessageId: null,
			createdAt: A_MINUTE,
		})
		await store.appendText("m-noted", "The parser is rewritten.")
		await store.finalizeMessage("m-noted", "complete")
		render(workspace.body())
		await settle()

		await openMission()

		const [line] = feedLines()
		expect(line).toContain("Nyx")
		expect(line).toContain("Note recorded")
		expect(line).toContain("The parser is rewritten.")
	})

	it("sends what the composer holds to the owning bot", async () => {
		const { workspace } = await seed((mission) => ({ mission, events: [] }))
		render(workspace.body())
		await settle()

		await openMission()
		await answer("Take the second option.")

		expect(workspace.driver.submissions).toHaveLength(1)
		expect(workspace.driver.submissions[0].scope.botId).toBe(workspace.bot.id)
		expect(workspace.driver.submissions[0].prompt).toContain(
			"Take the second option.",
		)
	})

	it("refuses the composer while the mission is closed", async () => {
		const { workspace } = await seed((mission) => ({
			mission: { ...mission, state: "done", closedAt: A_MINUTE },
			events: [],
		}))
		render(workspace.body())
		await settle()

		await openMission()

		expect(screen.getByRole("textbox").hasAttribute("disabled")).toBe(true)
	})

	it("shows an event recorded after the mission was opened", async () => {
		const announce: { toScreen: ((changed: MissionChanged) => void) | null } = {
			toScreen: null,
		}
		listenToMissions.mockImplementation((listener) => {
			announce.toScreen = listener
			return Promise.resolve(() => undefined)
		})
		const { workspace, mission } = await seed((opened) => ({
			mission: opened,
			events: [],
		}))
		render(workspace.body())
		await settle()

		await openMission()
		readMission.mockResolvedValue({
			mission,
			events: [eventOf("note", A_MINUTE, { text: "Two files touched." })],
		})
		await act(async () => {
			announce.toScreen?.({ missionId: "m-1", state: "working" })
		})
		await settle()

		expect(screen.getByText("Two files touched.")).toBeTruthy()
	})

	it("returns to the conversation the mission was opened from", async () => {
		const { workspace } = await seed((mission) => ({ mission, events: [] }))
		render(workspace.body())
		await settle()

		await openMission()
		expect(missionHeader()).toBeTruthy()

		fireEvent.keyDown(window, { key: "Escape" })
		await settle()

		expect(missionHeader()).toBeNull()
		expect(screen.getAllByText("Walls").length).toBeGreaterThan(0)
	})

	it("reads the mission again when the read failure is retried", async () => {
		const { workspace, mission } = await seed((opened) => ({
			mission: opened,
			events: [],
		}))
		readMission.mockRejectedValue(new Error("refused"))
		render(workspace.body())
		await settle()

		await openMission()
		expect(screen.getByText(READ_FAILURE_TITLE)).toBeTruthy()

		readMission.mockResolvedValue({ mission, events: [eventOf("opened", 0)] })
		fireEvent.click(screen.getByRole("button", { name: "Retry" }))
		await settle()

		expect(missionHeader()?.textContent).toContain("OPE-42")
	})

	it("raises a failure notice when the answer cannot reach the bot", async () => {
		const store = createFakeTranscriptStore()
		const refusing: TranscriptStore = {
			...store,
			startTurn: () => Promise.reject(new Error("refused")),
		}
		const { workspace } = await seed(
			(mission) => ({ mission, events: [] }),
			refusing,
		)
		render(workspace.body())
		render(createElement(NoticeSurface))
		await settle()

		await openMission()
		await answer("Take the second option.")

		await screen.findAllByText(SEND_FAILURE_TITLE)
		expect(missionHeader()).toBeTruthy()
	})
})
