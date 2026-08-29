import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SecretTarget } from "./secret-port"
import { secretTransport } from "./secret-transport"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

const SPACE: SecretTarget = {
	spaceId: "space-one",
	botId: null,
	serverName: null,
}

const BOT: SecretTarget = {
	spaceId: "space-one",
	botId: "bot-one",
	serverName: null,
}

const SERVER: SecretTarget = {
	spaceId: "space-one",
	botId: "bot-one",
	serverName: "atlas",
}

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

	it("reads back one entry a key, naming who serves it and who holds it", async () => {
		hostInvoke.mockResolvedValue({
			entries: [
				{
					key: "ATLAS_TOKEN",
					owners: [
						{ scope: "space", readable: true },
						{ scope: "bot", readable: true },
					],
					servedBy: { scope: "bot", readable: true },
				},
			],
		})

		const stored = await secretTransport.keys(BOT)

		expect(stored.entries[0]?.servedBy?.scope).toBe("bot")
		expect(hostInvoke).toHaveBeenCalledWith("secret_keys", {
			spaceId: "space-one",
			botId: "bot-one",
			server: undefined,
		})
	})

	it("reads a space through the command that takes a space", async () => {
		hostInvoke.mockResolvedValue({ entries: [] })

		await secretTransport.keys(SPACE)

		expect(hostInvoke).toHaveBeenCalledWith("secret_space_keys", {
			spaceId: "space-one",
		})
	})

	it("saves a space value through the command that takes a space", async () => {
		await secretTransport.set(SPACE, "ANTHROPIC_API_KEY", "sk-ant-atlas")

		expect(hostInvoke).toHaveBeenCalledWith("secret_space_set", {
			spaceId: "space-one",
			key: "ANTHROPIC_API_KEY",
			value: "sk-ant-atlas",
		})
	})

	it("deletes a space value through the command that takes a space", async () => {
		await secretTransport.delete(SPACE, "ANTHROPIC_API_KEY", "space")

		expect(hostInvoke).toHaveBeenCalledWith("secret_space_delete", {
			spaceId: "space-one",
			key: "ANTHROPIC_API_KEY",
		})
	})

	it("never sends a space target to a command that wants a bot", async () => {
		hostInvoke.mockResolvedValue({ entries: [] })

		await secretTransport.keys(SPACE)
		await secretTransport.set(SPACE, "KEY", "value")
		await secretTransport.delete(SPACE, "KEY", "space")

		const named = hostInvoke.mock.calls.map(([command]) => command)

		expect(named).not.toContain("secret_keys")
		expect(named).not.toContain("secret_set")
		expect(named).not.toContain("secret_delete")
	})

	it("saves at the scope the open panel owns", async () => {
		await secretTransport.set(SERVER, "ATLAS_TOKEN", "sk-atlas")

		expect(hostInvoke).toHaveBeenCalledWith("secret_set", {
			spaceId: "space-one",
			botId: "bot-one",
			server: "atlas",
			key: "ATLAS_TOKEN",
			value: "sk-atlas",
			scope: "server",
		})
	})

	it("deletes at the scope it is pointed at, not the one it is opened on", async () => {
		await secretTransport.delete(BOT, "ATLAS_TOKEN", "space")

		expect(hostInvoke).toHaveBeenCalledWith("secret_delete", {
			spaceId: "space-one",
			botId: "bot-one",
			server: undefined,
			key: "ATLAS_TOKEN",
			scope: "space",
		})
	})

	it("lets a refusal from the host through instead of swallowing it", async () => {
		hostInvoke.mockRejectedValue({ kind: "storeUnavailable", detail: "no" })

		await expect(
			secretTransport.set(BOT, "ATLAS_TOKEN", "sk-atlas"),
		).rejects.toEqual({ kind: "storeUnavailable", detail: "no" })
	})
})
