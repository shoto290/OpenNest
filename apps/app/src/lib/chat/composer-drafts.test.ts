// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

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

const SETTLE_MS = 200

const CONVERSATION_TITLE = "Round table"

const BOT_DRAFT = "half a thought for the bot"

const CONVERSATION_DRAFT = "half a thought for the room"

let layout: FakeLayout | null = null

const settle = async (ms: number) => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms)
	})
}

const mountApp = async () => {
	layout = fakeLayout()
	const store = createFakeTranscriptStore()
	const [space] = await store.spaces()
	const bot = await store.createBot(newBotIdentity([]), space.id)
	await store.createConversation({
		botIds: [bot.id],
		sectionId: null,
		spaceId: space.id,
		title: CONVERSATION_TITLE,
	})
	harness.store = store
	harness.driver = createFakeChatDriver({ stepMs: STEP_MS })
	render(createElement(App))
	await settle(SETTLE_MS)
	return bot
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

const open = async (name: string) => {
	await act(async () => {
		fireEvent.click(rowFor(name))
	})
	await settle(SETTLE_MS)
}

const composer = () =>
	screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Prompt" })

const typeDraft = (text: string) => {
	fireEvent.change(composer(), { target: { value: text } })
}

describe("composer drafts", () => {
	afterEach(() => {
		layout?.restore()
		layout = null
		cleanup()
		vi.useRealTimers()
	})

	it("holds a draft per thread across a bot to conversation round trip", async () => {
		vi.useFakeTimers()
		const bot = await mountApp()

		await open(bot.name)
		typeDraft(BOT_DRAFT)
		await open(CONVERSATION_TITLE)

		expect(composer().value).toBe("")

		typeDraft(CONVERSATION_DRAFT)
		await open(bot.name)

		expect(composer().value).toBe(BOT_DRAFT)

		await open(CONVERSATION_TITLE)

		expect(composer().value).toBe(CONVERSATION_DRAFT)
	})
})
