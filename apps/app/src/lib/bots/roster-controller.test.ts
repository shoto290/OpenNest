import { describe, expect, it, vi } from "vitest"

import type { BotSettingsValue } from "@workspace/ui/components/bot-settings-panel"

import { toSettingsValue } from "./bot-settings"
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

	it("creates a bot immediately, selects it and opens its settings on it", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)

		await controller.create()

		const state = controller.getState()
		expect(state.bots).toHaveLength(2)
		expect(state.selectedBotId).toBe(state.bots[1].id)
		expect(state.isEditing).toBe(true)
		expect(state.bots[1].name).toBe("New bot")
		// It is on the record before the panel opens on it, which is what "the bot
		// exists and then you name it" means.
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
				description: "Reads a diff.",
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
			description: "Reads a diff.",
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

	it("lands on the row that took the deleted one's place", async () => {
		const controller = await loaded(await anEmptyStore())
		await controller.create()
		await controller.create()
		const [first, second] = controller.getState().bots

		controller.select(first.id)
		await controller.remove(first.id)

		expect(controller.getState().bots.map((bot) => bot.id)).toEqual([second.id])
		expect(controller.getState().selectedBotId).toBe(second.id)
	})

	it("keeps the selection when another row's bot is deleted", async () => {
		const controller = await loaded(await anEmptyStore())
		await controller.create()
		await controller.create()
		const [first, second] = controller.getState().bots

		controller.select(second.id)
		await controller.remove(first.id)

		expect(controller.getState().selectedBotId).toBe(second.id)
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

	// Asking from a roster row is the same confirmation the panel's own button opens,
	// so asking selects the bot and stands the panel up over it. Nothing is deleted.
	it("selects and opens the bot a delete is asked about, and deletes nothing yet", async () => {
		const store = createFakeTranscriptStore()
		const deleted = vi.spyOn(store, "deleteBot")
		const controller = await loaded(store)

		controller.askToDelete("default")

		expect(controller.getState()).toMatchObject({
			selectedBotId: "default",
			isEditing: true,
			isConfirmingDelete: true,
		})
		expect(deleted).not.toHaveBeenCalled()

		controller.setEditing(false)
		expect(controller.getState().isConfirmingDelete).toBe(false)
	})
})
