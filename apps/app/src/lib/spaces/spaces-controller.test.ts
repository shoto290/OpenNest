import { describe, expect, it, vi } from "vitest"

import {
	createSpacesController,
	type SpacesController,
} from "./spaces-controller"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { TranscriptStore } from "../conversations/store-port"

const loaded = async (
	store: TranscriptStore,
	lastSpaceId: string | null = null,
) => {
	const controller = createSpacesController(store)
	await controller.load(lastSpaceId)
	return controller
}

const names = async (store: TranscriptStore) =>
	(await store.spaces()).map((space) => space.name)

const held = (controller: SpacesController) =>
	controller.getState().spaces.map((space) => space.name)

describe("createSpacesController", () => {
	it("opens on the space the record remembers", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")

		const controller = await loaded(store, elsewhere.id)

		expect(controller.getState().selectedSpaceId).toBe(elsewhere.id)
	})

	it("reports a listing it could not read instead of holding an empty roster", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "spaces").mockRejectedValue(new Error("no record"))

		const controller = await loaded(store)

		expect(controller.getState().hasFailedToLoad).toBe(true)
	})

	it("clears the reported failure once the listing reads again", async () => {
		const store = createFakeTranscriptStore()
		const listing = vi
			.spyOn(store, "spaces")
			.mockRejectedValueOnce(new Error("no record"))
		const controller = await loaded(store)

		await controller.load(null)

		expect(listing).toHaveBeenCalledTimes(2)
		expect(controller.getState().hasFailedToLoad).toBe(false)
	})

	it("opens on the first space when the record remembers none", async () => {
		const store = createFakeTranscriptStore()
		await store.createSpace("Vocca")

		const controller = await loaded(store)

		expect(controller.getState().selectedSpaceId).toBe("personal")
	})

	it("opens on the first space when the one it remembers is gone", async () => {
		const store = createFakeTranscriptStore()

		const controller = await loaded(store, "vacances")

		expect(controller.getState().selectedSpaceId).toBe("personal")
	})

	it("creates a space, selects it and leaves the roster of the others behind", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)

		await controller.create()

		const state = controller.getState()
		expect(state.spaces).toHaveLength(2)
		expect(state.selectedSpaceId).toBe(state.spaces[1].id)
		expect(await store.bots(state.selectedSpaceId)).toEqual([])
	})

	it("writes the name and the colour a space is given", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)

		controller.describe("personal", { name: "Vocca", colour: "cyan" })

		expect(controller.getState().spaces[0]).toMatchObject({
			name: "Vocca",
			colour: "cyan",
		})
		await vi.waitFor(async () =>
			expect((await store.spaces())[0]).toMatchObject({
				name: "Vocca",
				colour: "cyan",
			}),
		)
	})

	it("writes a space stripped of its colour", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)

		controller.describe("personal", { name: "Perso" })

		expect(controller.getState().spaces[0]).toMatchObject({
			name: "Perso",
			colour: null,
		})
		await vi.waitFor(async () =>
			expect((await store.spaces())[0]).toMatchObject({
				name: "Perso",
				colour: null,
			}),
		)
	})

	it("falls back to the first space that remains after a delete", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		await controller.create()
		const created = controller.getState().selectedSpaceId ?? ""

		await controller.remove(created)

		expect(controller.getState().selectedSpaceId).toBe("personal")
		expect(await names(store)).toEqual(["Personal"])
	})

	it("closes the settings on the space it deletes", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		await controller.create()
		controller.setSettingsOpen(true)

		await controller.remove(controller.getState().selectedSpaceId ?? "")

		expect(controller.getState().isSettingsOpen).toBe(false)
	})

	it("stays on the space it is in when the record refuses the delete", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)

		await controller.remove("personal")

		expect(controller.getState().selectedSpaceId).toBe("personal")
		expect(await names(store)).toEqual(["Personal"])
	})

	it("holds the new order before the record has taken it", async () => {
		const store = createFakeTranscriptStore()
		const vocca = await store.createSpace("Vocca")
		const controller = await loaded(store)
		const record = Promise.withResolvers<void>()
		vi.spyOn(store, "reorderSpaces").mockReturnValue(record.promise)

		const written = controller.reorder([vocca.id, "personal"])

		expect(held(controller)).toEqual(["Vocca", "Personal"])
		record.resolve()
		await written
	})

	it("stays on the space it is in when its rank changes", async () => {
		const store = createFakeTranscriptStore()
		const vocca = await store.createSpace("Vocca")
		const controller = await loaded(store, vocca.id)

		await controller.reorder([vocca.id, "personal"])

		expect(controller.getState().selectedSpaceId).toBe(vocca.id)
		expect(await names(store)).toEqual(["Vocca", "Personal"])
	})

	it("restores the order it held when a reorder is refused", async () => {
		const store = createFakeTranscriptStore()
		const vocca = await store.createSpace("Vocca")
		const controller = await loaded(store)
		vi.spyOn(store, "reorderSpaces").mockRejectedValue({
			kind: "unknownSpace",
			id: vocca.id,
		})

		await controller.reorder([vocca.id, "personal"])

		await vi.waitFor(() =>
			expect(held(controller)).toEqual(["Personal", "Vocca"]),
		)
	})

	it("leaves the record alone when the order it is given is the one it holds", async () => {
		const store = createFakeTranscriptStore()
		const vocca = await store.createSpace("Vocca")
		const controller = await loaded(store)
		const reorder = vi.spyOn(store, "reorderSpaces")

		await controller.reorder(["personal", vocca.id])

		expect(reorder).not.toHaveBeenCalled()
	})

	it("reports the refused create apart from a listing it could not read", async () => {
		const store = createFakeTranscriptStore()
		await store.createSpace("Vocca")
		const controller = await loaded(store)
		vi.spyOn(store, "createSpace").mockRejectedValue(new Error("no record"))

		await controller.create()

		expect(controller.getState().hasFailedToCreate).toBe(true)
		expect(controller.getState().hasFailedToLoad).toBe(false)
		expect(held(controller)).toEqual(await names(store))
	})

	it("clears the refused create once a create lands", async () => {
		const store = createFakeTranscriptStore()
		const create = vi
			.spyOn(store, "createSpace")
			.mockRejectedValueOnce(new Error("no record"))
		const controller = await loaded(store)
		await controller.create()

		await controller.create()

		expect(create).toHaveBeenCalledTimes(2)
		expect(controller.getState().hasFailedToCreate).toBe(false)
	})

	it("clears the refused create once the listing reads again", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "createSpace").mockRejectedValue(new Error("no record"))
		const controller = await loaded(store)
		await controller.create()

		await controller.load(null)

		expect(controller.getState().hasFailedToCreate).toBe(false)
	})

	it("reports the listing it could not read while re-reading after a refused create", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		vi.spyOn(store, "createSpace").mockRejectedValue(new Error("no record"))
		vi.spyOn(store, "spaces").mockRejectedValue(new Error("no record"))

		await controller.create()

		expect(controller.getState().hasFailedToCreate).toBe(true)
		expect(controller.getState().hasFailedToLoad).toBe(true)
	})

	it("stays on the space it is in when a create is refused", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "createSpace").mockRejectedValue(new Error("no record"))
		const controller = await loaded(store)

		await controller.create()

		expect(controller.getState().selectedSpaceId).toBe("personal")
		expect(controller.getState().spaces).toHaveLength(1)
	})
})
