import { describe, expect, it } from "vitest"

import { createEnvironmentController } from "./environment-controller"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { EnvScope } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

const SPACE: EnvScope = { kind: "space", id: "s-1" }

const BOT: EnvScope = { kind: "bot", id: "b-1", spaceId: "s-1" }

const opened = async (store: TranscriptStore, scope: EnvScope = BOT) => {
	const controller = createEnvironmentController(store)
	await controller.open(scope)
	return controller
}

const refusing = (
	store: TranscriptStore,
	member:
		| "environmentVariables"
		| "setEnvironmentVariable"
		| "deleteEnvironmentVariable",
) => ({
	...store,
	[member]: () => Promise.reject(new Error("refused")),
})

describe("environment controller", () => {
	it("opens on the names the scope already holds", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(BOT, "BOT_SEED", "1")

		const controller = await opened(store)

		expect(controller.getState().entries).toEqual([
			{ name: "BOT_SEED", definedIn: BOT, servedFrom: BOT },
		])
	})

	it("lists what the space defines beside what the bot defines", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(SPACE, "ATLAS_TOKEN", "sk-1")
		await store.setEnvironmentVariable(BOT, "BOT_SEED", "1")

		const controller = await opened(store)

		expect(controller.getState().entries).toEqual([
			{ name: "ATLAS_TOKEN", definedIn: SPACE, servedFrom: SPACE },
			{ name: "BOT_SEED", definedIn: BOT, servedFrom: BOT },
		])
	})

	it("writes a variable into the scope it was opened on", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store)

		await controller.set("ATLAS_TOKEN", "sk-1")

		expect(await store.environmentVariables(BOT)).toEqual([
			{ name: "ATLAS_TOKEN", definedIn: BOT, servedFrom: BOT },
		])
		expect(controller.getState().entries).toHaveLength(1)
	})

	it("takes a removed variable out of the list", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(BOT, "ATLAS_TOKEN", "sk-1")
		await store.setEnvironmentVariable(BOT, "BOT_SEED", "1")
		const controller = await opened(store)

		await controller.remove("ATLAS_TOKEN")

		expect(controller.getState().entries).toEqual([
			{ name: "BOT_SEED", definedIn: BOT, servedFrom: BOT },
		])
	})

	it("never reads a stored value back into what it lists", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store)

		await controller.set("ATLAS_TOKEN", "sk-1")

		expect(JSON.stringify(controller.getState())).not.toContain("sk-1")
	})

	it("hands back a refused write and leaves the list where it was", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(BOT, "BOT_SEED", "1")
		const controller = await opened(refusing(store, "setEnvironmentVariable"))

		await expect(controller.set("ATLAS_TOKEN", "sk-1")).rejects.toThrow(
			"refused",
		)
		expect(controller.getState().entries).toEqual([
			{ name: "BOT_SEED", definedIn: BOT, servedFrom: BOT },
		])
	})

	it("hands back a refused removal and leaves the list where it was", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(BOT, "BOT_SEED", "1")
		const controller = await opened(
			refusing(store, "deleteEnvironmentVariable"),
		)

		await expect(controller.remove("BOT_SEED")).rejects.toThrow("refused")
		expect(controller.getState().entries).toEqual([
			{ name: "BOT_SEED", definedIn: BOT, servedFrom: BOT },
		])
	})

	it("says so when the list could not be read", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(refusing(store, "environmentVariables"))

		expect(controller.getState().hasFailedToRead).toBe(true)
	})

	it("keeps the names it already holds when a later read fails", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(BOT, "BOT_SEED", "1")
		const controller = await opened(store)
		const held = controller.getState().entries

		store.environmentVariables = () => Promise.reject(new Error("refused"))
		await controller.set("ATLAS_TOKEN", "sk-1")

		expect(controller.getState().entries).toEqual(held)
		expect(controller.getState().hasFailedToRead).toBe(true)
	})

	it("clears the failure once the list can be read again", async () => {
		const store = createFakeTranscriptStore()
		await store.setEnvironmentVariable(BOT, "BOT_SEED", "1")
		const reading = store.environmentVariables
		store.environmentVariables = () => Promise.reject(new Error("refused"))
		const controller = await opened(store)
		expect(controller.getState().hasFailedToRead).toBe(true)

		store.environmentVariables = reading
		await controller.open(BOT)

		expect(controller.getState().hasFailedToRead).toBe(false)
		expect(controller.getState().entries).toHaveLength(1)
	})

	it("reads nothing while no scope is open", async () => {
		const store = createFakeTranscriptStore()
		const controller = createEnvironmentController(store)

		await controller.set("ATLAS_TOKEN", "sk-1")

		expect(controller.getState()).toEqual({
			scope: null,
			entries: [],
			hasFailedToRead: false,
		})
		expect(await store.environmentVariables(BOT)).toEqual([])
	})
})
