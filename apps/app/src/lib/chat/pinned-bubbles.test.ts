import { describe, expect, it } from "vitest"

import { pinnedBubblesOf } from "./pinned-bubbles"

import {
	createFakeTranscriptStore,
	FAKE_CHAT_ID,
} from "../conversations/fake-transcript-store"

const TURN = { id: "t-1", conversationId: FAKE_CHAT_ID, startedAt: 1 }

const ANSWER = {
	id: "a-1",
	conversationId: FAKE_CHAT_ID,
	turnId: "t-1",
	authorBotId: "default",
	repliedToMessageId: null,
	createdAt: 2,
}

const STALE_BLOCK = 7

const withTwoBlocks = async () => {
	const store = createFakeTranscriptStore()
	await store.startTurn(TURN)
	await store.openAssistantMessage(ANSWER)
	await store.appendText(ANSWER.id, "One.\n\nTwo.")
	await store.finalizeMessage(ANSWER.id, "complete")
	return store
}

const rowsOf = async (store: ReturnType<typeof createFakeTranscriptStore>) =>
	pinnedBubblesOf(await store.pinnedMessages(FAKE_CHAT_ID))

describe("pinnedBubblesOf", () => {
	it("keeps a stale pin apart from a live pin on the first bubble", async () => {
		const store = await withTwoBlocks()
		await store.pinMessage(FAKE_CHAT_ID, ANSWER.id, 0, 10)
		await store.pinMessage(FAKE_CHAT_ID, ANSWER.id, STALE_BLOCK, 20)

		const rows = await rowsOf(store)

		expect(rows).toHaveLength(2)
		expect(rows.map((row) => row.id)).toEqual(["a-1", `a-1#${STALE_BLOCK}`])
		expect(new Set(rows.map((row) => row.id)).size).toBe(2)
	})

	it("shows and anchors a stale pin on the first bubble of its message", async () => {
		const store = await withTwoBlocks()
		await store.pinMessage(FAKE_CHAT_ID, ANSWER.id, STALE_BLOCK, 20)

		const [stale] = await rowsOf(store)

		expect(stale.anchor).toBe("a-1")
		expect(stale.bubble.text).toBe("One.")
		expect(stale.pin.blockIndex).toBe(STALE_BLOCK)
	})

	it("drops only the pin the pressed row stands for", async () => {
		const store = await withTwoBlocks()
		await store.pinMessage(FAKE_CHAT_ID, ANSWER.id, 0, 10)
		await store.pinMessage(FAKE_CHAT_ID, ANSWER.id, STALE_BLOCK, 20)
		const [, pressed] = await rowsOf(store)

		expect(pressed.id).toBe(`a-1#${STALE_BLOCK}`)
		await store.unpinMessage(
			FAKE_CHAT_ID,
			pressed.pin.message.id,
			pressed.pin.blockIndex,
		)

		expect((await rowsOf(store)).map((row) => row.id)).toEqual(["a-1"])
	})
})
