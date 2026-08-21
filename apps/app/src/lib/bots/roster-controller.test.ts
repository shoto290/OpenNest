import { describe, expect, it, vi } from "vitest"

import type { BotSettingsValue } from "@workspace/ui/components/bot-settings"

import { BOT_NAMES, toSettingsValue } from "./bot-settings"
import { createRosterController } from "./roster-controller"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { Bot } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

/** A store with no bot in it, which is what a fresh install holds and what a reader
 * who deleted their last one comes back to. Emptied through the store's own delete
 * rather than by overriding the read: what it answers afterwards is what the record
 * really holds, so a create in one of these tests is still visible to a reload. */
const anEmptyStore = async (): Promise<TranscriptStore> => {
	const store = createFakeTranscriptStore()
	await store.deleteBot("default")
	return store
}

const loaded = async (store: TranscriptStore) => {
	const controller = createRosterController(store)
	await controller.load()
	return controller
}

const names = (bots: Bot[]) => bots.map((bot) => bot.name)

const edited = (
	value: BotSettingsValue,
	fields: Partial<BotSettingsValue>,
): BotSettingsValue => ({ ...value, ...fields })

const held = (controller: { getState: () => { bots: Bot[] } }, id: string) => {
	const bot = controller.getState().bots.find((entry) => entry.id === id)
	if (!bot) {
		throw new Error(`the roster does not hold ${id}`)
	}
	return bot
}

/** What a reload sees: a second controller over the same store, reading the record
 * the first one left rather than the state it was holding. */
const reloaded = async (store: TranscriptStore) =>
	(await loaded(store)).getState()

let spoken = 0

/** One settled message in a bot's main conversation, written through the store the
 * way a turn writes it, so what the roster reads back is what a launch would find. */
const saidTo = async (
	store: TranscriptStore,
	botId: string,
	content: string,
) => {
	spoken += 1
	const chat = await store.mainChat(botId)
	const turn = `turn-${spoken}`
	await store.startTurn({
		id: turn,
		conversationId: chat.id,
		startedAt: spoken,
	})
	await store.appendUserMessage({
		id: `said-${spoken}`,
		conversationId: chat.id,
		turnId: turn,
		authorBotId: null,
		repliedToMessageId: null,
		content,
		createdAt: spoken,
	})
	return { chatId: chat.id, turnId: turn, createdAt: spoken }
}

/** A reply the bot is still writing: opened on the record and never finalised. */
const answering = async (store: TranscriptStore, botId: string) => {
	const { chatId, turnId } = await saidTo(store, botId, "And?")
	await store.openAssistantMessage({
		id: `answer-${spoken}`,
		conversationId: chatId,
		turnId,
		authorBotId: botId,
		repliedToMessageId: null,
		createdAt: spoken,
	})
	await store.appendText(`answer-${spoken}`, "Still wri")
}

describe("createRosterController", () => {
	it("opens on the roster it finds and creates nothing", async () => {
		const store = createFakeTranscriptStore()
		const listed = vi.spyOn(store, "createBot")
		const controller = await loaded(store)

		const state = controller.getState()
		expect(names(state.bots)).toEqual(["Claude"])
		expect(state.selectedBotId).toBe("default")
		expect(state.isEditing).toBe(false)
		expect(listed).not.toHaveBeenCalled()
	})

	// The empty state, and the whole reason the launch reads instead of insisting:
	// nothing is selected, so nothing above this can open a chat.
	it("opens on nothing when the record holds no bot", async () => {
		const controller = await loaded(await anEmptyStore())

		expect(controller.getState().bots).toEqual([])
		expect(controller.getState().selectedBotId).toBeNull()
	})

	// What the boot screen stands on, and the only thing that can hold it: a launch
	// and a reader who owns no bot both hold no rows.
	it("says nothing has been read until the rows land", async () => {
		const controller = createRosterController(await anEmptyStore())

		expect(controller.getState().hasLoaded).toBe(false)

		await controller.load()

		expect(controller.getState().hasLoaded).toBe(true)
	})

	// A record that cannot be read has still answered. Waiting on it forever would
	// leave the reader looking at the launch screen with no way out of it.
	it("counts a refused read as an answer", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "bots").mockRejectedValue(new Error("no record"))
		const controller = createRosterController(store)

		await controller.load()

		expect(controller.getState().hasLoaded).toBe(true)
	})

	it("creates a bot immediately, selects it and leaves the settings closed", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)

		await controller.create()

		const state = controller.getState()
		expect(state.bots).toHaveLength(2)
		expect(state.selectedBotId).toBe(state.bots[1].id)
		expect(state.isEditing).toBe(false)
		expect(BOT_NAMES).toContain(state.bots[1].name)
		// It is on the record and named before anybody describes it, which is what
		// "the bot exists and then you name it" means.
		expect((await reloaded(store)).bots).toHaveLength(2)
	})

	it("gives every bot it creates a face no other bot is wearing", async () => {
		const controller = await loaded(await anEmptyStore())

		await controller.create()
		await controller.create()
		await controller.create()

		const worn = controller.getState().bots.map((bot) => bot.avatarAnimal)
		expect(new Set(worn).size).toBe(worn.length)
	})

	it("writes what is typed and survives a reload", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const id = "default"
		const value = toSettingsValue(held(controller, id))

		controller.describe(
			id,
			edited(value, {
				name: "Nyx",
				title: "Reviewer",
				instructions: "Answer briefly.",
				model: "haiku",
				identity: { animal: "owl", blot: "sky" },
			}),
		)
		// Shown before the store has answered: the panel is controlled by this state,
		// so a field that waited for a round trip would drop what came next.
		expect(held(controller, id).name).toBe("Nyx")
		await vi.waitFor(() => expect(held(controller, id).title).toBe("Reviewer"))

		const stored = (await reloaded(store)).bots[0]
		expect(stored).toMatchObject({
			name: "Nyx",
			title: "Reviewer",
			instructions: "Answer briefly.",
			model: "haiku",
			avatarAnimal: "owl",
			avatarBlot: "sky",
		})
	})

	// A keystroke is faster than a round trip. Every value describes the same bot, so
	// only the last one is worth writing — and it is the one that has to land.
	it("coalesces a burst of edits into the write of the last value", async () => {
		const store = createFakeTranscriptStore()
		const written = vi.spyOn(store, "updateBot")
		const controller = await loaded(store)
		const value = toSettingsValue(held(controller, "default"))

		for (const name of ["N", "Ny", "Nyx"]) {
			controller.describe("default", edited(value, { name }))
		}

		await vi.waitFor(async () =>
			expect((await reloaded(store)).bots[0].name).toBe("Nyx"),
		)
		expect(written.mock.calls.length).toBeLessThan(3)
	})

	it("takes the picture off when an animal is picked and keeps it when it is not", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

		await controller.uploadAvatar("default", {
			arrayBuffer: () => Promise.resolve(png.buffer),
		} as File)
		const worn = held(controller, "default").avatarImagePath
		expect(worn).not.toBeNull()

		// A value that still carries the image keeps the path the store handed out.
		controller.describe(
			"default",
			edited(toSettingsValue(held(controller, "default")), { name: "Nyx" }),
		)
		await vi.waitFor(async () =>
			expect((await reloaded(store)).bots[0].avatarImagePath).toBe(worn),
		)

		// Picking an animal emits an identity with no image at all, which is the one
		// way a picture comes off a bot.
		const value = toSettingsValue(held(controller, "default"))
		controller.describe("default", {
			...value,
			identity: { animal: "bear", blot: "amber" },
		})
		await vi.waitFor(async () =>
			expect((await reloaded(store)).bots[0].avatarImagePath).toBeNull(),
		)
	})

	// The panel that asked closes with the bot, and the reader lands at the top of the
	// roster rather than on the row the deleted one left behind — which is why the one
	// deleted here is a middle row, where the two landings differ.
	it("closes the panel and lands on the first row once a bot is deleted", async () => {
		const controller = await loaded(await anEmptyStore())
		await controller.create()
		await controller.create()
		await controller.create()
		const [first, second, third] = controller.getState().bots

		controller.askToDelete(second.id)
		await controller.remove(second.id)

		const state = controller.getState()
		expect(state.bots.map((bot) => bot.id)).toEqual([first.id, third.id])
		expect(state).toMatchObject({
			selectedBotId: first.id,
			isEditing: false,
			isShowingDanger: false,
		})
	})

	// Deleting the last bot is allowed, and what is left is the empty state rather
	// than a bot the app wrote back to have something to show.
	it("leaves nothing selected and nothing open once the last bot is deleted", async () => {
		const controller = await loaded(await anEmptyStore())
		await controller.create()
		const [only] = controller.getState().bots

		controller.edit(only.id)
		await controller.remove(only.id)

		const state = controller.getState()
		expect(state.bots).toEqual([])
		expect(state.selectedBotId).toBeNull()
		expect(state.isEditing).toBe(false)
	})

	it("takes the transcript of the bot it deletes", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		const chat = await store.mainChat("default")
		await store.startTurn({ id: "t1", conversationId: chat.id, startedAt: 1 })
		await store.appendUserMessage({
			id: "m1",
			conversationId: chat.id,
			turnId: "t1",
			authorBotId: null,
			repliedToMessageId: null,
			content: "hello",
			createdAt: 2,
		})

		await controller.remove("default")

		const page = await store.loadPage(chat.id, null)
		expect(page.messages).toEqual([])
	})

	it("puts the reader back on what the store holds when a write is refused", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded({
			...store,
			updateBot: () =>
				Promise.reject({ kind: "storage", failure: { kind: "staleWrite" } }),
		})
		const value = toSettingsValue(held(controller, "default"))

		controller.describe("default", edited(value, { name: "Nyx" }))
		expect(held(controller, "default").name).toBe("Nyx")

		await vi.waitFor(() =>
			expect(held(controller, "default").name).toBe("Claude"),
		)
	})

	// Asking from a roster row opens the panel where the delete lives, and nothing
	// else: the confirmation is the panel's own, and the reader still has to ask.
	it("selects the bot a delete is asked about and opens it on the danger group", async () => {
		const store = createFakeTranscriptStore()
		const deleted = vi.spyOn(store, "deleteBot")
		const controller = await loaded(store)

		controller.askToDelete("default")

		expect(controller.getState()).toMatchObject({
			selectedBotId: "default",
			isEditing: true,
			isShowingDanger: true,
		})
		expect(deleted).not.toHaveBeenCalled()

		controller.setEditing(false)
		expect(controller.getState().isShowingDanger).toBe(false)
	})

	// The group is about the bot it was asked for and no other. Anything that points
	// the panel somewhere else lets go of it, or the reader would find a delete armed
	// for a bot they never asked about.
	it("lets go of the danger group when the panel is pointed at another bot", async () => {
		const controller = await loaded(await anEmptyStore())
		await controller.create()
		await controller.create()
		const [first, second] = controller.getState().bots

		controller.askToDelete(second.id)
		controller.select(first.id)

		expect(controller.getState().isShowingDanger).toBe(false)

		controller.askToDelete(second.id)
		controller.edit(first.id)

		expect(controller.getState().isShowingDanger).toBe(false)
	})

	// A record the panel's bot has left is a panel with nothing to edit: the read that
	// finds it gone closes the panel rather than re-aiming it at whoever is left.
	it("closes the panel when a read no longer holds the bot it was open on", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		controller.askToDelete("default")
		await store.deleteBot("default")

		await controller.load()

		expect(controller.getState()).toMatchObject({
			isEditing: false,
			isShowingDanger: false,
		})
	})
})

describe("createRosterController previews", () => {
	// The row previews the conversation, not the selection: a bot nobody has opened
	// still shows what was last said to it.
	it("reads the last word of every bot's conversation, not only the open one", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		await controller.create()
		const [first, second] = controller.getState().bots
		await saidTo(store, first.id, "Pulled the three papers.")
		await saidTo(store, second.id, "Rebuilding the bundle.")

		const state = (await loaded(store)).getState()

		expect(state.previews[first.id]).toMatchObject({
			text: "Pulled the three papers.",
		})
		expect(state.previews[second.id]).toMatchObject({
			text: "Rebuilding the bundle.",
		})
	})

	// The row is dated from the record too, off the same message it previews: a bot
	// nobody has opened is still a bot that last spoke at a time.
	it("reads when the last word was said", async () => {
		const store = createFakeTranscriptStore()
		const said = await saidTo(store, "default", "Pulled the three papers.")

		const state = (await loaded(store)).getState()

		expect(state.previews.default?.at).toBe(said.createdAt)
	})

	it("previews nothing for a bot nothing has been said to", async () => {
		const state = (await loaded(createFakeTranscriptStore())).getState()

		expect(state.previews.default).toBeUndefined()
	})

	// The pose stands in the preview's place while a bot works, so an answer still
	// being written is worth nothing here: the last settled message holds.
	it("holds the last settled message while the next one streams", async () => {
		const store = createFakeTranscriptStore()
		await saidTo(store, "default", "Pulled the three papers.")
		await answering(store, "default")

		const state = (await loaded(store)).getState()

		expect(state.previews.default).toMatchObject({ text: "And?" })
	})

	// The preview goes with the row it previewed: what a deleted bot last said is not
	// a conversation anybody can open any more.
	it("drops the preview of the bot it deletes and keeps every other", async () => {
		const store = createFakeTranscriptStore()
		const seeded = await loaded(store)
		await seeded.create()
		const [first, second] = seeded.getState().bots
		await saidTo(store, first.id, "Pulled the three papers.")
		await saidTo(store, second.id, "Rebuilding the bundle.")
		const controller = await loaded(store)

		await controller.remove(second.id)

		const { previews } = controller.getState()
		expect(previews).not.toHaveProperty(second.id)
		expect(previews[first.id]).toMatchObject({
			text: "Pulled the three papers.",
		})
	})

	// One conversation the store will not answer for is one blank row, not a roster
	// without previews.
	it("leaves the row of a conversation it cannot read blank and every other standing", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		await controller.create()
		const [first, second] = controller.getState().bots
		await saidTo(store, second.id, "Rebuilding the bundle.")
		const refused = (await store.mainChat(first.id)).id
		const refusing: TranscriptStore = {
			...store,
			loadPage: (conversationId, cursor) =>
				conversationId === refused
					? Promise.reject({ kind: "storage" })
					: store.loadPage(conversationId, cursor),
		}

		const state = (await loaded(refusing)).getState()

		expect(state.previews[first.id]).toBeUndefined()
		expect(state.previews[second.id]).toMatchObject({
			text: "Rebuilding the bundle.",
		})
		expect(state.bots).toHaveLength(2)
	})
})
