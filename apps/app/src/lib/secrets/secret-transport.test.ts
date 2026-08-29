import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { secretTransport } from "./secret-transport"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

beforeEach(() => {
	hostInvoke.mockReset()
	hostInvoke.mockResolvedValue(undefined)
})

describe("secretTransport", () => {
	it("asks the host whether the store can be reached at all", async () => {
		hostInvoke.mockResolvedValue(true)

		await expect(secretTransport.isReady()).resolves.toBe(true)
		expect(hostInvoke).toHaveBeenCalledWith("secret_store_ready")
	})

	it("reads back the keys one bot has answered", async () => {
		hostInvoke.mockResolvedValue(["ATLAS_TOKEN"])

		await expect(secretTransport.keys("bot-one")).resolves.toEqual([
			"ATLAS_TOKEN",
		])
		expect(hostInvoke).toHaveBeenCalledWith("secret_keys", {
			botId: "bot-one",
		})
	})

	it("hands a value over under the bot and key it belongs to", async () => {
		await secretTransport.set("bot-one", "ATLAS_TOKEN", "sk-atlas")

		expect(hostInvoke).toHaveBeenCalledWith("secret_set", {
			botId: "bot-one",
			key: "ATLAS_TOKEN",
			value: "sk-atlas",
		})
	})

	it("names the bot and the key it clears", async () => {
		await secretTransport.delete("bot-one", "ATLAS_TOKEN")

		expect(hostInvoke).toHaveBeenCalledWith("secret_delete", {
			botId: "bot-one",
			key: "ATLAS_TOKEN",
		})
	})

	it("lets a refusal from the host through instead of swallowing it", async () => {
		hostInvoke.mockRejectedValue({ kind: "storeUnavailable", detail: "no" })

		await expect(
			secretTransport.set("bot-one", "ATLAS_TOKEN", "sk-atlas"),
		).rejects.toEqual({ kind: "storeUnavailable", detail: "no" })
	})
})
