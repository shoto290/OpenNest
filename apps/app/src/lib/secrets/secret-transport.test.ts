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
	it("asks the host what the store can do and what it still needs", async () => {
		hostInvoke.mockResolvedValue({
			isReady: false,
			needsPassphrase: true,
			hasVault: true,
		})

		await expect(secretTransport.status()).resolves.toEqual({
			isReady: false,
			needsPassphrase: true,
			hasVault: true,
		})
		expect(hostInvoke).toHaveBeenCalledWith("secret_store_status")
	})

	it("reads back the keys one bot answered apart from the ones it cannot read", async () => {
		hostInvoke.mockResolvedValue({
			readable: ["ATLAS_TOKEN"],
			unreadable: ["ATLAS_REGION"],
			inheritedReadable: ["LEDGER_TOKEN"],
			inheritedUnreadable: ["LEDGER_REGION"],
		})

		await expect(secretTransport.keys("bot-one")).resolves.toEqual({
			readable: ["ATLAS_TOKEN"],
			unreadable: ["ATLAS_REGION"],
			inheritedReadable: ["LEDGER_TOKEN"],
			inheritedUnreadable: ["LEDGER_REGION"],
		})
		expect(hostInvoke).toHaveBeenCalledWith("secret_keys", {
			botId: "bot-one",
		})
	})

	it("hands the passphrase over without naming the bot it was typed under", async () => {
		await secretTransport.unlock("open sesame")

		expect(hostInvoke).toHaveBeenCalledWith("secret_unlock_vault", {
			passphrase: "open sesame",
		})
	})

	it("hands a value over under the bot, key and scope it belongs to", async () => {
		await secretTransport.set("bot-one", "ATLAS_TOKEN", "sk-atlas", "bot")

		expect(hostInvoke).toHaveBeenCalledWith("secret_set", {
			botId: "bot-one",
			key: "ATLAS_TOKEN",
			value: "sk-atlas",
			scope: "bot",
		})
	})

	it("names the space as the scope a value is saved at", async () => {
		await secretTransport.set("bot-one", "ATLAS_TOKEN", "sk-atlas", "space")

		expect(hostInvoke).toHaveBeenCalledWith("secret_set", {
			botId: "bot-one",
			key: "ATLAS_TOKEN",
			value: "sk-atlas",
			scope: "space",
		})
	})

	it("names the bot, the key and the scope it clears", async () => {
		await secretTransport.delete("bot-one", "ATLAS_TOKEN", "space")

		expect(hostInvoke).toHaveBeenCalledWith("secret_delete", {
			botId: "bot-one",
			key: "ATLAS_TOKEN",
			scope: "space",
		})
	})

	it("lets a refusal from the host through instead of swallowing it", async () => {
		hostInvoke.mockRejectedValue({ kind: "storeUnavailable", detail: "no" })

		await expect(
			secretTransport.set("bot-one", "ATLAS_TOKEN", "sk-atlas", "bot"),
		).rejects.toEqual({ kind: "storeUnavailable", detail: "no" })
	})
})
