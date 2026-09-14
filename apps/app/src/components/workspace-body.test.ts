// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react"
import { type ComponentProps, createElement, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import "@workspace/ui/lib/i18n"

import type { ActivityPanel } from "@/components/thread-routines"
import { WorkspaceBody } from "@/components/workspace-body"
import { createAttachmentsController } from "@/lib/chat/attachments-controller"
import { createAttachmentsPort } from "@/lib/chat/attachments-port"
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
import {
	createOpenedMissionController,
	type SelectedRow,
} from "@/lib/missions/opened-mission-controller"
import { createFakeOnboardingPort } from "@/lib/onboarding/fake-onboarding-port"
import { createSignInController } from "@/lib/onboarding/sign-in-controller"
import { type FakeLayout, fakeLayout } from "@/lib/perf/fake-layout"
import { createOpenedRoutineController } from "@/lib/routines/opened-routine-controller"
import { routinesTransport } from "@/lib/routines/routines-transport"
import { triggerSourcesTransport } from "@/lib/routines/trigger-sources-transport"
import { createMessageLandingController } from "@/lib/search/message-landing-controller"

vi.mock("@/lib/routines/routines-transport", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/routines/routines-transport")>()

	return {
		...actual,
		routinesTransport: {
			...actual.routinesTransport,
			list: vi.fn(),
			runs: vi.fn(),
		},
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
const listRuns = vi.mocked(routinesTransport.runs)
const listSources = vi.mocked(triggerSourcesTransport.sources)
const listMissions = vi.mocked(missionsTransport.list)
const readMission = vi.mocked(missionsTransport.detail)
const listenToMissions = vi.mocked(missionsTransport.onChanged)

const SPACE = "personal"

const THREAD_CONVERSATION = "c-mission-1"

const OBJECTIVE = "Rewrite the changelog parser"

const ACTIVITY = "Activity"

const CLOSE_ACTIVITY = "Close activity"

const A_MINUTE = 60_000

const BACK = "Back to the conversation"

const READ_FAILURE_TITLE = "Couldn't load this mission"

const SEND_FAILURE_TITLE = "Couldn't send your answer"

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
	stateSeq: 1,
	openedAt: 0,
	closedAt: null,
	reportedAt: null,
	reportedTurnId: null,
})

const eventOf = (
	kind: MissionEvent["kind"],
	createdAt: number,
	payload: unknown = null,
): MissionEvent => ({
	id: `e-${kind}-${createdAt}`,
	missionId: "m-1",
	kind,
	source: "bot",
	payload,
	createdAt,
})

const createFakeRoster = () => {
	const listeners = new Set<() => void>()
	let selected: SelectedRow = {
		selectedBotId: null,
		selectedConversationId: null,
	}

	return {
		getState: () => selected,
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		select: (conversationId: string) => {
			selected = {
				selectedBotId: null,
				selectedConversationId: conversationId,
			}
			for (const listener of [...listeners]) {
				listener()
			}
		},
	}
}

type WorkspaceBodyHarnessProps = Omit<
	ComponentProps<typeof WorkspaceBody>,
	"activityPanel"
> & {
	isActivityPanelOpenAtFirst: boolean
}

const WorkspaceBodyHarness = ({
	isActivityPanelOpenAtFirst,
	...body
}: WorkspaceBodyHarnessProps) => {
	const [isOpen, setOpen] = useState(isActivityPanelOpenAtFirst)

	return createElement(WorkspaceBody, {
		...body,
		activityPanel: {
			isOpen,
			onOpenChange: setOpen,
			openedRoutine: createOpenedRoutineController(),
		},
	})
}

type Workspace = {
	bot: Bot
	conversation: Conversation
	otherConversation: Conversation
	driver: ScriptedDriver
	body: (options?: BodyOptions) => ReturnType<typeof createElement>
	controlledBody: (
		activityPanel: ActivityPanel,
	) => ReturnType<typeof createElement>
}

type BodyOptions = {
	selected?: Conversation
	isActivityPanelOpenAtFirst?: boolean
}

const workspaceOf = async (store = createFakeTranscriptStore()) => {
	const [bot] = await seatBots(store, SPACE, ["Nyx"])
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: [bot.id],
	})
	const otherConversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Roof",
		botIds: [bot.id],
	})
	const driver = createScriptedDriver()
	const runtimes = createConversationRuntimes(driver, store)
	const chatController = createChatController(createScriptedDriver(), store)
	const attachments = createAttachmentsController(
		createAttachmentsPort({ chat: chatController, driver, runtimes }),
	)
	const roster = createFakeRoster()
	const missions = createOpenedMissionController(roster)
	const signIn = createSignInController(createFakeOnboardingPort(), {
		reopen: async () => undefined,
	})

	const bodyProps = (selected: Conversation) => {
		roster.select(selected.id)

		return {
			attachments,
			bots: [bot],
			chat: { state: initialChatState, controller: chatController },
			conversation: selected,
			conversationRuntimes: runtimes,
			drafts: createDraftsController(),
			haveSpacesFailed: false,
			isConversationSettingsOpen: false,
			isOverlayOpen: false,
			isSettingsOpen: false,
			landings: createMessageLandingController(),
			missions,
			onOpenConversationSettings: () => undefined,
			onRetrySpaces: () => undefined,
			onToggleSettings: () => undefined,
			readerName: "Reader",
			signIn: { state: signIn.getState(), controller: signIn },
		}
	}

	const workspace: Workspace = {
		bot,
		conversation,
		otherConversation,
		driver,
		body: ({
			selected = conversation,
			isActivityPanelOpenAtFirst = false,
		}: BodyOptions = {}) =>
			createElement(WorkspaceBodyHarness, {
				...bodyProps(selected),
				isActivityPanelOpenAtFirst,
			}),
		controlledBody: (activityPanel: ActivityPanel) =>
			createElement(WorkspaceBody, {
				...bodyProps(conversation),
				activityPanel,
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
	const missions = screen.getByRole("region", { name: "Waiting on you" })
	fireEvent.click(
		within(missions).getByRole("button", { name: new RegExp(OBJECTIVE) }),
	)
	await settle()
}

const missionHeader = () =>
	document.querySelector('[data-slot="mission-header"]')

const missionChanges = () => {
	const listeners = new Set<(changed: MissionChanged) => void>()

	listenToMissions.mockImplementation((listener) => {
		listeners.add(listener)
		return Promise.resolve(() => {
			listeners.delete(listener)
		})
	})

	return () =>
		act(async () => {
			for (const listener of [...listeners]) {
				listener({ missionId: "m-1", state: "working", stateSeq: 1 })
			}
		})
}

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
		listRuns.mockResolvedValue([])
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

	it("sends what the composer holds to the owning companion", async () => {
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

	it("shows an event recorded after the mission was opened", async () => {
		const announce = missionChanges()
		const { workspace, mission } = await seed((opened) => ({
			mission: opened,
			events: [],
		}))
		render(workspace.body())
		await settle()

		await openMission()
		readMission.mockResolvedValue({
			mission,
			events: [eventOf("note", A_MINUTE, { line: "Two files touched." })],
		})
		await announce()
		await settle()

		expect(screen.getByText("Two files touched.")).toBeTruthy()
	})

	it("keeps the thread on screen when a later read of the mission fails", async () => {
		const announce = missionChanges()
		const { workspace } = await seed((mission) => ({
			mission,
			events: [eventOf("opened", 0)],
		}))
		render(workspace.body())
		render(createElement(NoticeSurface))
		await settle()

		await openMission()
		readMission.mockRejectedValue(new Error("refused"))
		await announce()
		await settle()

		await screen.findAllByText(READ_FAILURE_TITLE)
		expect(missionHeader()).toBeTruthy()
		expect(screen.getByText(/Mission opened by/)).toBeTruthy()
	})

	it("returns to the conversation the mission was opened from", async () => {
		const { workspace } = await seed((mission) => ({ mission, events: [] }))
		render(workspace.body())
		await settle()

		await openMission()
		expect(missionHeader()).toBeTruthy()

		fireEvent.click(screen.getByRole("button", { name: BACK }))
		await settle()

		expect(missionHeader()).toBeNull()
		expect(screen.getAllByText("Walls").length).toBeGreaterThan(0)
	})

	it("shows the thread of the origin row when it is selected again", async () => {
		const { workspace } = await seed((mission) => ({ mission, events: [] }))
		const view = render(workspace.body())
		await settle()

		await openMission()
		expect(missionHeader()).toBeTruthy()

		view.rerender(workspace.body({ selected: workspace.otherConversation }))
		await settle()
		expect(missionHeader()).toBeNull()

		view.rerender(workspace.body())
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

	it("raises a failure notice when the answer cannot reach the companion", async () => {
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

describe("WorkspaceBody activity panel", () => {
	let layout: FakeLayout

	beforeEach(() => {
		layout = fakeLayout()
		vi.clearAllMocks()
		listRoutines.mockResolvedValue([])
		listRuns.mockResolvedValue([])
		listSources.mockResolvedValue([])
		listMissions.mockResolvedValue({ open: [], done: [] })
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		layout.restore()
	})

	const activityToggle = () => screen.getByRole("button", { name: ACTIVITY })

	const isPanelOpen = () =>
		screen.queryByRole("button", { name: CLOSE_ACTIVITY }) !== null

	const isPanelClosed = () =>
		screen.queryByRole("button", { name: ACTIVITY }) !== null

	it("opens the first thread with the panel already open", async () => {
		const workspace = await workspaceOf()
		render(workspace.body({ isActivityPanelOpenAtFirst: true }))
		await settle()

		expect(isPanelOpen()).toBe(true)
	})

	it("renders the panel closed when the preference is not set", async () => {
		const workspace = await workspaceOf()
		render(workspace.body())
		await settle()

		expect(isPanelClosed()).toBe(true)
	})

	it("holds the panel open when the reader moves to another conversation", async () => {
		const workspace = await workspaceOf()
		const view = render(workspace.body())
		await settle()

		fireEvent.click(activityToggle())
		await settle()
		expect(isPanelOpen()).toBe(true)

		view.rerender(workspace.body({ selected: workspace.otherConversation }))
		await settle()

		expect(isPanelOpen()).toBe(true)
	})

	it("asks for the new value and shows only the state it is given", async () => {
		const workspace = await workspaceOf()
		const onOpenChange = vi.fn()
		render(
			workspace.controlledBody({
				isOpen: false,
				onOpenChange,
				openedRoutine: createOpenedRoutineController(),
			}),
		)
		await settle()

		fireEvent.click(activityToggle())
		await settle()

		expect(onOpenChange).toHaveBeenCalledWith(true)
		expect(isPanelClosed()).toBe(true)
	})
})
