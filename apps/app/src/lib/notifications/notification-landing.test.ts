// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { useSyncExternalStore } from "react"
import { afterEach, expect, it } from "vitest"

import { createFakeNotificationPort } from "./fake-notification-port"
import { startNotificationSource } from "./notification-source"

import { newBotIdentity } from "../bots/bot-settings"
import { createRosterController } from "../bots/roster-controller"
import { initialChatState } from "../chat/chat-state"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import { createFakeMissions } from "../missions/fake-missions"
import { aMission } from "../missions/mission-fixtures"
import { createSpacesController } from "../spaces/spaces-controller"
import { useSpaceEntry } from "../spaces/use-space-entry"

const HOME = "personal"

const ALL_ON = {
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
}

const PREFERENCES = {
	colorScheme: "system",
	language: null,
	sidebarWidth: null,
	lastSpaceId: null,
	lastBotIdBySpace: {},
} as const

const idleChat = {
	stateFor: () => initialChatState,
	subscribe: () => () => undefined,
}

const idleRuntimes = {
	heldFor: () => null,
	subscribe: () => () => undefined,
}

const aReader = () => {
	const reopened: string[] = []

	return {
		reopened,
		getState: () => ({ preferences: PREFERENCES }),
		setLastSpace: async (spaceId: string) => {
			reopened.push(spaceId)
		},
	}
}

const aWorld = async () => {
	const store = createFakeTranscriptStore()
	const elsewhere = await store.createSpace("Vocca")
	const neighbour = await store.createBot(newBotIdentity([]), HOME)
	const away = await store.createBot(newBotIdentity([]), elsewhere.id)
	const room = await store.createConversation({
		spaceId: elsewhere.id,
		sectionId: null,
		title: "Release",
		botIds: [away.id],
	})

	const spaces = createSpacesController(store)
	await spaces.load(null)
	const roster = createRosterController(store)
	await roster.load({
		spaceIds: [HOME, elsewhere.id],
		spaceId: HOME,
		lastRowId: null,
	})

	const notifications = createFakeNotificationPort()
	const missions = createFakeMissions()
	const reader = aReader()

	startNotificationSource({
		chat: idleChat,
		runtimes: idleRuntimes,
		roster,
		spaces,
		missions,
		notifications,
		switches: () => ALL_ON,
		hasFocus: () => false,
		watchFocus: async () => () => undefined,
		raiseWindow: async () => undefined,
		playChime: () => undefined,
		reportFailure: () => undefined,
	})
	await Promise.resolve()

	renderHook(() => {
		const { selectedSpaceId } = useSyncExternalStore(
			spaces.subscribe,
			spaces.getState,
		)
		useSpaceEntry({ roster, user: reader, selectedSpaceId })
	})

	return {
		spaces,
		roster,
		missions,
		notifications,
		reader,
		elsewhere,
		neighbour,
		away,
		room,
	}
}

afterEach(() => {
	cleanup()
})

it("enters the space holding the bot the click carries and lands on that bot", async () => {
	const { spaces, roster, notifications, reader, elsewhere, away } =
		await aWorld()

	await act(async () => {
		notifications.activate({ kind: "bot", id: away.id })
	})

	expect(spaces.getState().selectedSpaceId).toBe(elsewhere.id)
	expect(roster.getState().selectedBotId).toBe(away.id)
	expect(reader.reopened).toContain(elsewhere.id)
})

it("enters the space holding the conversation the click carries and lands on it", async () => {
	const { spaces, roster, notifications, elsewhere, room } = await aWorld()

	await act(async () => {
		notifications.activate({ kind: "conversation", id: room.id })
	})

	expect(spaces.getState().selectedSpaceId).toBe(elsewhere.id)
	expect(roster.getState().selectedConversationId).toBe(room.id)
	expect(roster.getState().selectedBotId).toBeNull()
})

it("lands on a bot of the space already on screen without changing space", async () => {
	const { spaces, roster, notifications, neighbour } = await aWorld()

	await act(async () => {
		notifications.activate({ kind: "bot", id: neighbour.id })
	})

	expect(spaces.getState().selectedSpaceId).toBe(HOME)
	expect(roster.getState().selectedBotId).toBe(neighbour.id)
})

it("enters the space of the mission's bot and opens that mission thread", async () => {
	const { spaces, roster, notifications, missions, elsewhere, away } =
		await aWorld()
	const mission = aMission({ id: "mission-9", botId: away.id })
	missions.hold({ mission, events: [] })

	await act(async () => {
		notifications.activate({ kind: "mission", id: mission.id })
	})

	expect(spaces.getState().selectedSpaceId).toBe(elsewhere.id)
	expect(roster.getState().selectedBotId).toBe(away.id)
	expect(missions.opened).toEqual([{ missionId: mission.id, rowId: away.id }])
})

it("opens a mission of the space already on screen without changing space", async () => {
	const { spaces, roster, notifications, missions, neighbour } = await aWorld()
	const mission = aMission({ id: "mission-10", botId: neighbour.id })
	missions.hold({ mission, events: [] })

	await act(async () => {
		notifications.activate({ kind: "mission", id: mission.id })
	})

	expect(spaces.getState().selectedSpaceId).toBe(HOME)
	expect(roster.getState().selectedBotId).toBe(neighbour.id)
	expect(missions.opened).toHaveLength(1)
})
