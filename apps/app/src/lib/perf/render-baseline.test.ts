// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement, Profiler, type ProfilerOnRenderCallback } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { setRenderProbe } from "@workspace/ui/lib/render-probe"

import "@workspace/ui/lib/i18n"

import { newBotIdentity } from "@/lib/bots/bot-settings"
import type { FakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { type FakeLayout, fakeLayout } from "@/lib/perf/fake-layout"

const harness = vi.hoisted(
	(): { store: TranscriptStore | null; driver: FakeChatDriver | null } => ({
		store: null,
		driver: null,
	}),
)

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => harness.store,
}))

vi.mock("@/lib/chat/create-driver", () => ({
	createChatDriver: () => harness.driver,
}))

const { App } = await import("@/App")

const STEP_MS = 1

const STEP_LIMIT = 200

const STEPS_INTO_TURN = 6

const MOUNT_MS = 200

const SPACE_COUNT = 3

const BOTS_PER_SPACE = 2

const FRAME_COUNT = 60

const FRAME_MS = 1000 / 60

const WORDS_PER_CHUNK = 3

const SHORT_TURN_CHUNKS = 11

const LONG_TURN_CHUNKS = 22

const OPEN_STEP_LIMIT = 400

const LONG_TRANSCRIPT_MESSAGES = 500

const MOUNTED_RUN_LIMIT = 20

const replyOf = (chunks: number) =>
	"word ".repeat(chunks * WORDS_PER_CHUNK).trim()

const maxOf = (counts: number[]) =>
	counts.length === 0 ? 0 : Math.max(...counts)

const seedRoster = async (store: TranscriptStore) => {
	const spaceIds = (await store.spaces()).map((space) => space.id)
	while (spaceIds.length < SPACE_COUNT) {
		const born = await store.createSpace(`Space ${spaceIds.length}`)
		spaceIds.push(born.id)
	}
	for (const spaceId of spaceIds) {
		const held = await store.bots(spaceId)
		for (let index = held.length; index < BOTS_PER_SPACE; index += 1) {
			await store.createBot(newBotIdentity(held), spaceId)
		}
	}
}

const seedTranscript = async (
	store: TranscriptStore,
	botId: string,
	messages: number,
) => {
	const conversationId = `chat-${botId}`
	for (let index = 0; index < messages; index += 1) {
		const turnId = `${botId}-turn-${index}`
		const id = `${botId}-m${index}`
		await store.startTurn({ conversationId, id: turnId, startedAt: index })
		if (index % 2 === 0) {
			await store.appendUserMessage({
				authorBotId: null,
				content: `Question ${index} for the transcript`,
				conversationId,
				createdAt: index,
				id,
				repliedToMessageId: null,
				turnId,
			})
		} else {
			await store.openAssistantMessage({
				authorBotId: botId,
				conversationId,
				createdAt: index,
				id,
				repliedToMessageId: null,
				turnId,
			})
			await store.appendText(id, `Answer ${index} in prose`)
			await store.finalizeMessage(id, "complete")
		}
		await store.completeTurn(turnId, index)
	}
}

type CommitCounter = { count: number; onRender: ProfilerOnRenderCallback }

const countCommits = (): CommitCounter => {
	const counter: CommitCounter = {
		count: 0,
		onRender: () => {
			counter.count += 1
		},
	}
	return counter
}

const rowFor = (name: string) => {
	const labels = [...document.querySelectorAll('[data-slot="roster-row-name"]')]
	const row = labels.find((label) => label.textContent === name)
	const button = row?.closest("button")
	if (!button) {
		throw new Error(`no roster row for ${name}`)
	}
	return button
}

type FrameClock = { advance: (now: number) => void }

const takeFrameClock = (): FrameClock => {
	const pending = new Map<number, FrameRequestCallback>()
	let nextId = 1
	globalThis.requestAnimationFrame = (callback) => {
		const id = nextId
		nextId += 1
		pending.set(id, callback)
		return id
	}
	globalThis.cancelAnimationFrame = (id: number) => {
		pending.delete(id)
	}
	return {
		advance: (now) => {
			const due = [...pending.values()]
			pending.clear()
			for (const callback of due) {
				callback(now)
			}
		},
	}
}

type AttributeWrite = { isNoOp: boolean; owner: Element | null }

type AttributeRecorder = {
	take: () => AttributeWrite[]
	restore: () => void
}

const recordAvatarAttributeWrites = (): AttributeRecorder => {
	const original = Element.prototype.setAttribute
	let writes: AttributeWrite[] = []
	Element.prototype.setAttribute = function patched(
		this: Element,
		name: string,
		value: string,
	) {
		if (this.hasAttribute("data-part")) {
			writes.push({
				isNoOp: this.getAttribute(name) === value,
				owner: this.closest("svg"),
			})
		}
		return original.call(this, name, value)
	}
	return {
		take: () => {
			const taken = writes
			writes = []
			return taken
		},
		restore: () => {
			Element.prototype.setAttribute = original
		},
	}
}

type FrameTally = {
	writes: number
	noOpWrites: number
	quietFrames: number
	movingAvatars: number
}

const tallyFrames = (frames: FrameClock): FrameTally => {
	const recorder = recordAvatarAttributeWrites()
	recorder.take()
	const owners = new Set<Element>()
	let writes = 0
	let noOpWrites = 0
	let quietFrames = 0
	for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
		frames.advance(frame * FRAME_MS)
		const written = recorder.take()
		let noOpsInFrame = 0
		for (const write of written) {
			if (write.isNoOp) noOpsInFrame += 1
			if (write.owner) owners.add(write.owner)
		}
		writes += written.length
		noOpWrites += noOpsInFrame
		if (written.length > 0 && noOpsInFrame === written.length) {
			quietFrames += 1
		}
	}
	recorder.restore()
	return { writes, noOpWrites, quietFrames, movingAvatars: owners.size }
}

type RenderTally = {
	countOf: (name: string) => number
	entriesOf: (name: string) => [string, number][]
	reset: () => void
}

const tallyRenders = (): RenderTally => {
	let counts = new Map<string, number>()
	setRenderProbe((name, key) => {
		const id = key === undefined ? name : `${name} ${key}`
		counts.set(id, (counts.get(id) ?? 0) + 1)
	})
	return {
		countOf: (name) => counts.get(name) ?? 0,
		entriesOf: (name) =>
			[...counts.entries()]
				.filter(([id]) => id.startsWith(`${name} `))
				.map(([id, count]): [string, number] => [
					id.slice(name.length + 1),
					count,
				]),
		reset: () => {
			counts = new Map()
		},
	}
}

const settle = async (ms: number) => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms)
	})
}

const submitPrompt = async (text: string) => {
	const input = screen.getByRole("textbox", { name: "Prompt" })
	fireEvent.change(input, { target: { value: text } })
	await act(async () => {
		fireEvent.keyDown(input, { key: "Enter" })
	})
}

type TurnWatch = { chunks: number; isEnded: boolean }

const watchTurn = (driver: FakeChatDriver): TurnWatch => {
	const watch = { chunks: 0, isEnded: false }
	void driver.subscribe(({ event }) => {
		if (event.type === "messageDelta") {
			watch.chunks += 1
		}
		if (event.type === "turnEnded") {
			watch.isEnded = true
		}
	})
	return watch
}

const streamOneTurn = async (text: string, watch: TurnWatch) => {
	watch.isEnded = false
	watch.chunks = 0
	await submitPrompt(text)
	for (let step = 0; step < STEP_LIMIT && !watch.isEnded; step += 1) {
		await settle(STEP_MS)
	}
	await settle(STEP_MS)
}

const mountApp = async (replyFor?: (prompt: string) => string) => {
	const frames = takeFrameClock()
	layout = fakeLayout()
	const store = createFakeTranscriptStore()
	harness.store = store
	harness.driver = createFakeChatDriver({ stepMs: STEP_MS, replyFor })
	const watch = watchTurn(harness.driver)
	await seedRoster(store)
	render(createElement(App))
	await settle(MOUNT_MS)
	return { watch, frames }
}

const measureLongTranscriptOpen = async () => {
	layout = fakeLayout()
	const store = createFakeTranscriptStore({
		pageSize: LONG_TRANSCRIPT_MESSAGES,
	})
	const [space] = await store.spaces()
	const bot = await store.createBot(
		newBotIdentity(await store.bots(space.id)),
		space.id,
	)
	await seedTranscript(store, bot.id, LONG_TRANSCRIPT_MESSAGES)
	harness.store = store
	harness.driver = createFakeChatDriver({ stepMs: STEP_MS })
	const commits = countCommits()
	render(
		createElement(
			Profiler,
			{ id: "app", onRender: commits.onRender },
			createElement(App),
		),
	)
	await settle(MOUNT_MS)

	const openedAt = commits.count
	let hasPaintedRow = false
	setRenderProbe((name) => {
		hasPaintedRow ||= name === "ThreadTurn"
	})
	await act(async () => {
		fireEvent.click(rowFor(bot.name))
	})
	for (let step = 0; step < OPEN_STEP_LIMIT && !hasPaintedRow; step += 1) {
		await settle(STEP_MS)
	}
	await settle(MOUNT_MS)

	return {
		commits: commits.count - openedAt,
		messages: LONG_TRANSCRIPT_MESSAGES,
		mountedRuns: document.querySelectorAll('[data-slot="message-scroller-row"]')
			.length,
	}
}

const measureTurn = async (chunks: number) => {
	const tally = tallyRenders()
	const { watch } = await mountApp(() => replyOf(chunks))

	await streamOneTurn("first turn", watch)
	const settledTurns = tally.entriesOf("ThreadTurn").map(([key]) => key)
	tally.reset()

	await streamOneTurn("second turn", watch)
	const turns = tally.entriesOf("ThreadTurn")
	const countsWhere = (isSettled: boolean) =>
		turns
			.filter(([key]) => settledTurns.includes(key) === isSettled)
			.map(([, count]) => count)

	return {
		chunks: watch.chunks,
		app: tally.countOf("App"),
		appSidebar: tally.countOf("AppSidebar"),
		rosterBots: tally.countOf("rosterBots"),
		rosterBotsBySpace: tally.countOf("rosterBotsBySpace"),
		streamingTurn: maxOf(countsWhere(false)),
		quietTurn: maxOf(countsWhere(true)),
	}
}

let layout: FakeLayout | null = null

describe("PRF1 render baseline", () => {
	afterEach(() => {
		setRenderProbe(null)
		layout?.restore()
		layout = null
		cleanup()
		vi.useRealTimers()
	})

	it("counts what one streamed turn re-renders", async () => {
		vi.useFakeTimers()

		expect(await measureTurn(SHORT_TURN_CHUNKS)).toMatchInlineSnapshot(`
			{
			  "app": 19,
			  "appSidebar": 6,
			  "chunks": 11,
			  "quietTurn": 2,
			  "rosterBots": 6,
			  "rosterBotsBySpace": 6,
			  "streamingTurn": 3,
			}
		`)
	})

	it("counts what a turn twice as long re-renders", async () => {
		vi.useFakeTimers()

		expect(await measureTurn(LONG_TURN_CHUNKS)).toMatchInlineSnapshot(`
			{
			  "app": 30,
			  "appSidebar": 6,
			  "chunks": 22,
			  "quietTurn": 2,
			  "rosterBots": 6,
			  "rosterBotsBySpace": 6,
			  "streamingTurn": 3,
			}
		`)
	})

	it("counts what the avatars write over sixty frames", async () => {
		vi.useFakeTimers()
		const { frames } = await mountApp()

		const idle = tallyFrames(frames)
		await submitPrompt("keep the roster busy")
		await settle(STEP_MS * STEPS_INTO_TURN)
		const working = tallyFrames(frames)

		expect({
			avatars: document.querySelectorAll('[data-part="rig"]').length,
			filters: document.querySelectorAll("filter").length,
			avatarFilters: document.querySelectorAll(
				'filter[id^="bot-avatar-sketch-"]',
			).length,
			idle,
			working,
		}).toMatchInlineSnapshot(`
			{
			  "avatarFilters": 6,
			  "avatars": 6,
			  "filters": 6,
			  "idle": {
			    "movingAvatars": 0,
			    "noOpWrites": 0,
			    "quietFrames": 0,
			    "writes": 0,
			  },
			  "working": {
			    "movingAvatars": 3,
			    "noOpWrites": 0,
			    "quietFrames": 0,
			    "writes": 1004,
			  },
			}
		`)
	})

	it("mounts a handful of runs for a five hundred message transcript", async () => {
		vi.useFakeTimers()

		const opened = await measureLongTranscriptOpen()

		expect(opened.mountedRuns).toBeLessThan(MOUNTED_RUN_LIMIT)
		expect(opened).toMatchInlineSnapshot(`
			{
			  "commits": 10,
			  "messages": 500,
			  "mountedRuns": 8,
			}
		`)
	})
})
