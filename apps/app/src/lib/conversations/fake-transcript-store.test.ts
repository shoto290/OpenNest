import { describe, expect, it } from "vitest"

import {
	createFakeTranscriptStore,
	FAKE_CHAT_ID,
} from "./fake-transcript-store"
import type { NewAssistantMessage, NewUserMessage } from "./store-contract"
import { botIdentity, message, named } from "./transcript-fixtures"

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
			messages: [
				message({ id: "stored-1", conversationId: FAKE_CHAT_ID, seq: 7 }),
			],
		})

		expect(await store.appendUserMessage(PROMPT)).toBe(8)
	})

	it("lists the bot it ships with, then the ones it is told to make", async () => {
		const store = createFakeTranscriptStore()

		const created = await store.createBot(botIdentity())

		expect((await store.bots()).map((bot) => bot.id)).toEqual([
			"default",
			created.id,
		])
		expect(created.name).toBe("Nyx")
		expect(created.model).toBe("opus")
		expect(created.avatarAnimal).toBe("owl")
	})

	it("replaces who a bot is and leaves its id and its moment alone", async () => {
		const store = createFakeTranscriptStore()
		const created = await store.createBot(botIdentity())

		const updated = await store.updateBot(
			created.id,
			botIdentity({ name: "Ada", model: "haiku", avatarBlot: "slate" }),
		)

		expect(updated.id).toBe(created.id)
		expect(updated.createdAt).toBe(created.createdAt)
		expect(updated.name).toBe("Ada")
		expect(updated.model).toBe("haiku")
		expect(updated.avatarBlot).toBe("slate")
	})

	it("refuses a write on a bot it no longer holds", async () => {
		const store = createFakeTranscriptStore()
		const created = await store.createBot(botIdentity())
		await store.deleteBot(created.id)

		await expect(store.deleteBot(created.id)).rejects.toEqual({
			kind: "unknownBot",
			id: created.id,
		})
		await expect(store.updateBot(created.id, botIdentity())).rejects.toEqual({
			kind: "unknownBot",
			id: created.id,
		})
		expect((await store.bots()).map((bot) => bot.id)).toEqual(["default"])
	})

	it("lets the last bot go and answers an empty list after it", async () => {
		const store = createFakeTranscriptStore()

		await store.deleteBot("default")

		expect(await store.bots()).toEqual([])
	})

	// The list is a column of the bot's own row, so the file drops it with the row.
	// A bot created at the id a deleted one held is a new bot, offering nothing.
	it("forgets what a deleted bot's sessions announced", async () => {
		const store = createFakeTranscriptStore()
		await store.recordBotCommands("default", named("review"))

		await store.deleteBot("default")

		expect(await store.botCommands("default")).toEqual([])
	})

	it("dresses a bot in an uploaded picture and answers a path for it", async () => {
		const store = createFakeTranscriptStore()

		const worn = await store.setBotAvatarImage("default", aPng())

		expect(worn.avatarImagePath).toMatch(/\.png$/)
		expect((await store.bots())[0].avatarImagePath).toBe(worn.avatarImagePath)
	})

	/** The refusal the host decides on the bytes and nothing else, so the fake decides
	 * it the same way: a caller that handled a rejection here handles the real one. */
	it("refuses bytes that are not one of the formats a picture may arrive as", async () => {
		const store = createFakeTranscriptStore()

		await expect(
			store.setBotAvatarImage("default", new Uint8Array([0x47, 0x49, 0x46])),
		).rejects.toEqual({
			kind: "rejectedAvatarImage",
			reason: { kind: "unknownFormat" },
		})
		expect((await store.bots())[0].avatarImagePath).toBeNull()
	})

	it("refuses a picture over the limit with the limit it broke", async () => {
		const store = createFakeTranscriptStore()
		const limit = 5 * 1024 * 1024

		await expect(
			store.setBotAvatarImage("default", new Uint8Array(limit + 1)),
		).rejects.toEqual({
			kind: "rejectedAvatarImage",
			reason: { kind: "tooLarge", bytes: limit + 1, limit },
		})
	})

	it("refuses a picture for a bot it no longer holds", async () => {
		const store = createFakeTranscriptStore()
		await store.deleteBot("default")

		await expect(store.setBotAvatarImage("default", aPng())).rejects.toEqual({
			kind: "unknownBot",
			id: "default",
		})
	})

	/** The same shape the host answers: a skill named by the directory it would live
	 * in, a second one of the same name written beside the first rather than over it,
	 * a mark that is its own write, and a skill that is gone reported as one. */
	it("writes, marks and takes away a bot's skills", async () => {
		const store = createFakeTranscriptStore()
		const draft = { name: "Baking Bread", description: "How.", body: "Bake." }

		const created = await store.createBotSkill("default", draft)
		const beside = await store.createBotSkill("default", draft)

		expect(created).toEqual({
			id: "baking-bread",
			...draft,
			isPreloaded: false,
		})
		expect(beside.id).toBe("baking-bread-2")

		const marked = await store.setBotSkillPreloaded("default", created.id, true)
		expect(marked.isPreloaded).toBe(true)

		const renamed = await store.updateBotSkill("default", created.id, {
			...draft,
			name: "Baking",
		})
		expect(renamed).toEqual({ ...marked, name: "Baking" })

		await store.deleteBotSkill("default", created.id)
		expect(await store.botSkills("default")).toEqual([beside])
		await expect(
			store.deleteBotSkill("default", created.id),
		).rejects.toMatchObject({ kind: "unwritableBundle" })
		await expect(store.createBotSkill("missing", draft)).rejects.toMatchObject({
			kind: "unknownBot",
			id: "missing",
		})
	})

	/** Taking a picture off is an identity write, the same one that puts an animal
	 * back — there is no second call for it on either side of the boundary. */
	it("takes the picture off a bot described again without a path", async () => {
		const store = createFakeTranscriptStore()
		await store.setBotAvatarImage("default", aPng())

		const bare = await store.updateBot("default", botIdentity())

		expect(bare.avatarImagePath).toBeNull()
	})
})

/** A png signature and nothing behind it: the fake reads the leading bytes, which is
 * what the host reads to decide the same thing. */
const aPng = () =>
	new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
