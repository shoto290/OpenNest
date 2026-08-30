import { describe, expect, it, vi } from "vitest"

import { createMcpServersController } from "./mcp-servers-controller"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { EnvOwner } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

const BOT: EnvOwner = { kind: "bot", id: "default", spaceId: "personal" }

const SPACE: EnvOwner = { kind: "space", id: "personal" }

const ATLAS = { command: "npx", args: ["-y", "@atlas/mcp-server"] }

const LEDGER = { type: "http", url: "https://ledger.internal/mcp" }

const opened = async (store: TranscriptStore, owner: EnvOwner = BOT) => {
	const controller = createMcpServersController(store)
	await controller.open(owner)
	return controller
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("mcp servers controller", () => {
	it("opens on the servers the bundle already declares", async () => {
		const store = createFakeTranscriptStore()
		await store.setBotMcpServer("default", "atlas", ATLAS)

		const controller = await opened(store)

		expect(controller.getState().servers).toEqual([
			{ name: "atlas", config: ATLAS },
		])
	})

	it("reports a listing it could not read instead of an empty panel", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "botMcpServers").mockRejectedValue(new Error("no bundle"))

		const controller = await opened(store)

		expect(controller.getState().hasFailedToLoad).toBe(true)
	})

	it("clears the reported failure once the listing reads again", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "botMcpServers").mockRejectedValueOnce(
			new Error("no bundle"),
		)
		const controller = await opened(store)

		await controller.open(BOT)

		expect(controller.getState().hasFailedToLoad).toBe(false)
	})

	it("writes a server under the name it was given", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store)

		controller.create("atlas", ATLAS)
		await settled()

		expect(await store.botMcpServers("default")).toEqual([
			{ name: "atlas", config: ATLAS },
		])
		expect(controller.getState().servers).toEqual([
			{ name: "atlas", config: ATLAS },
		])
	})

	it("writes a changed configuration to the server it was opened on", async () => {
		const store = createFakeTranscriptStore()
		await store.setBotMcpServer("default", "atlas", ATLAS)
		const controller = await opened(store)

		controller.rename("atlas", "atlas", LEDGER)
		await settled()

		expect(await store.botMcpServers("default")).toEqual([
			{ name: "atlas", config: LEDGER },
		])
	})

	it("moves a renamed server rather than leaving a second one behind", async () => {
		const store = createFakeTranscriptStore()
		await store.setBotMcpServer("default", "ledger", LEDGER)
		const controller = await opened(store)

		controller.rename("ledger", "books", LEDGER)
		await settled()

		expect(await store.botMcpServers("default")).toEqual([
			{ name: "books", config: LEDGER },
		])
		expect(controller.getState().servers).toEqual([
			{ name: "books", config: LEDGER },
		])
	})

	it("takes a removed server out and leaves the rest where they were", async () => {
		const store = createFakeTranscriptStore()
		await store.setBotMcpServer("default", "atlas", ATLAS)
		await store.setBotMcpServer("default", "ledger", LEDGER)
		const controller = await opened(store)

		controller.remove("atlas")
		await settled()

		expect(await store.botMcpServers("default")).toEqual([
			{ name: "ledger", config: LEDGER },
		])
	})

	it("falls back to what the bundle holds when a write is refused", async () => {
		const store = createFakeTranscriptStore()
		await store.setBotMcpServer("default", "atlas", ATLAS)
		const controller = await opened(store)

		controller.remove("missing")
		await settled()
		await settled()

		expect(controller.getState().servers).toEqual([
			{ name: "atlas", config: ATLAS },
		])
	})

	it("opens on the servers the space plugin already declares", async () => {
		const store = createFakeTranscriptStore()
		await store.setSpaceMcpServer("personal", "atlas", ATLAS)

		const controller = await opened(store, SPACE)

		expect(controller.getState().servers).toEqual([
			{ name: "atlas", config: ATLAS },
		])
	})

	it("reports a space listing it could not read instead of an empty panel", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "spaceMcpServers").mockRejectedValue(new Error("no plugin"))

		const controller = await opened(store, SPACE)

		expect(controller.getState().hasFailedToLoad).toBe(true)
	})

	it("writes a space server into the space plugin and leaves the bots alone", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store, SPACE)

		controller.create("atlas", ATLAS)
		await settled()

		expect(await store.spaceMcpServers("personal")).toEqual([
			{ name: "atlas", config: ATLAS },
		])
		expect(await store.botMcpServers("default")).toEqual([])
	})

	it("moves a renamed space server rather than leaving a second one behind", async () => {
		const store = createFakeTranscriptStore()
		await store.setSpaceMcpServer("personal", "ledger", LEDGER)
		const controller = await opened(store, SPACE)

		controller.rename("ledger", "books", LEDGER)
		await settled()

		expect(await store.spaceMcpServers("personal")).toEqual([
			{ name: "books", config: LEDGER },
		])
	})

	it("takes a removed space server out of the space plugin", async () => {
		const store = createFakeTranscriptStore()
		await store.setSpaceMcpServer("personal", "atlas", ATLAS)
		await store.setSpaceMcpServer("personal", "ledger", LEDGER)
		const controller = await opened(store, SPACE)

		controller.remove("atlas")
		await settled()

		expect(await store.spaceMcpServers("personal")).toEqual([
			{ name: "ledger", config: LEDGER },
		])
	})

	it("writes nothing while nothing is open", async () => {
		const store = createFakeTranscriptStore()
		const controller = createMcpServersController(store)

		controller.create("atlas", ATLAS)
		await settled()

		expect(await store.botMcpServers("default")).toEqual([])
	})
})
