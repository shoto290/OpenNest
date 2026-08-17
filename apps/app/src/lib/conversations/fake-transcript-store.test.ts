import { describe, expect, it } from "vitest"

import {
	createFakeTranscriptStore,
	FAKE_CHAT_ID,
} from "./fake-transcript-store"
import type { NewAssistantMessage, NewUserMessage } from "./store-contract"
import { message } from "./transcript-fixtures"

const TURN = { id: "t-1", conversationId: FAKE_CHAT_ID, startedAt: 1 }

const PROMPT: NewUserMessage = {
	id: "m-1",
	conversationId: FAKE_CHAT_ID,
	turnId: "t-1",
	authorBotId: null,
	repliedToMessageId: null,
	content: "hello",
	createdAt: 2,
}

const REPLY: NewAssistantMessage = {
	id: "m-2",
	conversationId: FAKE_CHAT_ID,
	turnId: "t-1",
	authorBotId: "default",
	repliedToMessageId: "m-1",
	createdAt: 3,
}

const contentOf = async (
	store: ReturnType<typeof createFakeTranscriptStore>,
	id: string,
) => {
	const page = await store.loadPage(FAKE_CHAT_ID, null)
	return page.messages.find((entry) => entry.id === id)
}

/** The fake stands in for the host in every controller test, so the rules it is
 * trusted to hold are asserted here rather than assumed. Each one mirrors a rule
 * `messages.rs` holds inside the transaction that writes it. */
describe("createFakeTranscriptStore", () => {
	it("answers a replayed write with the place it already gave the row", async () => {
		const store = createFakeTranscriptStore()

		expect(await store.startTurn(TURN)).toBe(await store.startTurn(TURN))
		expect(await store.appendUserMessage(PROMPT)).toBe(1)
		expect(await store.appendUserMessage(PROMPT)).toBe(1)
		expect(await store.openAssistantMessage(REPLY)).toBe(2)
		expect(await store.openAssistantMessage(REPLY)).toBe(2)

		const page = await store.loadPage(FAKE_CHAT_ID, null)
		expect(page.messages.map((entry) => entry.id)).toEqual(["m-1", "m-2"])
	})

	it("refuses a second row claiming one id and saying something else", async () => {
		const store = createFakeTranscriptStore()
		await store.appendUserMessage(PROMPT)

		await expect(
			store.appendUserMessage({ ...PROMPT, content: "something else" }),
		).rejects.toEqual({ kind: "conflict", id: "m-1", field: "content" })
	})

	it("streams into an open reply and stops at its ending", async () => {
		const store = createFakeTranscriptStore()
		await store.openAssistantMessage(REPLY)
		await store.appendText("m-2", "Hel")
		await store.appendText("m-2", "lo")

		expect(await contentOf(store, "m-2")).toMatchObject({
			content: "Hello",
			completion: "streaming",
		})

		await store.finalizeMessage("m-2", "complete")
		await store.appendText("m-2", " late")

		expect(await contentOf(store, "m-2")).toMatchObject({
			content: "Hello",
			completion: "complete",
		})
	})

	it("takes an ending once and refuses a different one after it", async () => {
		const store = createFakeTranscriptStore()
		await store.openAssistantMessage(REPLY)
		await store.finalizeMessage("m-2", "cancelled")
		await store.finalizeMessage("m-2", "cancelled")

		expect(await contentOf(store, "m-2")).toMatchObject({
			completion: "cancelled",
		})
		await expect(store.finalizeMessage("m-2", "complete")).rejects.toEqual({
			kind: "invalidTransition",
			id: "m-2",
			from: "cancelled",
			to: "complete",
		})
	})

	it("pages back from the newest, and says when there is more", async () => {
		const store = createFakeTranscriptStore({
			pageSize: 2,
			messages: Array.from({ length: 5 }, (_, index) =>
				message({
					id: `m-${index + 1}`,
					conversationId: FAKE_CHAT_ID,
					seq: index + 1,
				}),
			),
		})

		const tail = await store.loadPage(FAKE_CHAT_ID, null)
		expect(tail.messages.map((entry) => entry.id)).toEqual(["m-4", "m-5"])
		expect(tail.hasMore).toBe(true)

		const older = await store.loadPage(FAKE_CHAT_ID, { beforeSeq: 4 })
		expect(older.messages.map((entry) => entry.id)).toEqual(["m-2", "m-3"])
		expect(older.hasMore).toBe(true)

		const first = await store.loadPage(FAKE_CHAT_ID, { beforeSeq: 2 })
		expect(first.messages.map((entry) => entry.id)).toEqual(["m-1"])
		expect(first.hasMore).toBe(false)
	})

	it("keeps writing where a seeded transcript left off", async () => {
		const store = createFakeTranscriptStore({
			messages: [message({ id: "stored-1", conversationId: FAKE_CHAT_ID, seq: 7 })],
		})

		expect(await store.appendUserMessage(PROMPT)).toBe(8)
	})
})
