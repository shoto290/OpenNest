import { describe, expect, it } from "vitest"

import { createMcpServersController } from "./mcp-servers-controller"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { TranscriptStore } from "../conversations/store-port"

const ATLAS = { command: "npx", args: ["-y", "@atlas/mcp-server"] }

const LEDGER = { type: "http", url: "https://ledger.internal/mcp" }

const opened = async (store: TranscriptStore, botId = "default") => {
	const controller = createMcpServersController(store)
	await controller.open(botId)
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

	it("writes nothing while no bot is open", async () => {
		const store = createFakeTranscriptStore()
		const controller = createMcpServersController(store)

		controller.create("atlas", ATLAS)
		await settled()

		expect(await store.botMcpServers("default")).toEqual([])
	})
})
