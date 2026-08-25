import { describe, expect, it, vi } from "vitest"

import { createSpacesController } from "./spaces-controller"

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

describe("createSpacesController", () => {
	it("opens on the space the record remembers", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")

		const controller = await loaded(store, elsewhere.id)

		expect(controller.getState().selectedSpaceId).toBe(elsewhere.id)
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

	it("stays on the space it is in when a create is refused", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "createSpace").mockRejectedValue(new Error("no record"))
		const controller = await loaded(store)

		await controller.create()

		expect(controller.getState().selectedSpaceId).toBe("personal")
		expect(controller.getState().spaces).toHaveLength(1)
	})
})
