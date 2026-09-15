import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { connectorTransport } from "./connector-transport"

import type { EnvOwner } from "../conversations/store-contract"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

const BOT: EnvOwner = { kind: "bot", id: "b-1", spaceId: "s-1" }

const URL = "https://mcp.atlas.test/mcp"

beforeEach(() => {
	hostInvoke.mockReset()
	hostInvoke.mockResolvedValue(undefined)
})

describe("connectorTransport", () => {
	it("hands the host the owner, the connector and its url to connect", async () => {
		await connectorTransport.connect(BOT, "atlas", URL)

		expect(hostInvoke).toHaveBeenCalledWith("mcp_oauth_connect", {
			owner: BOT,
			name: "atlas",
			url: URL,
		})
	})

	it("asks the host to cancel the running flow", async () => {
		await connectorTransport.cancel()

		expect(hostInvoke).toHaveBeenCalledWith("mcp_oauth_cancel")
	})

	it("hands the host the owner, the connector and its url to disconnect", async () => {
		hostInvoke.mockResolvedValue({ revoked: true })

		const disconnected = await connectorTransport.disconnect(BOT, "atlas", URL)

		expect(hostInvoke).toHaveBeenCalledWith("mcp_oauth_disconnect", {
			owner: BOT,
			name: "atlas",
			url: URL,
		})
		expect(disconnected).toEqual({ revoked: true })
	})

	it("names the user as the owner of every call", async () => {
		const user: EnvOwner = { kind: "user" }

		await connectorTransport.status(user)
		await connectorTransport.connect(user, "atlas", URL)
		await connectorTransport.disconnect(user, "atlas", URL)

		expect(hostInvoke.mock.calls).toEqual([
			["mcp_connector_status", { owner: user }],
			["mcp_oauth_connect", { owner: user, name: "atlas", url: URL }],
			["mcp_oauth_disconnect", { owner: user, name: "atlas", url: URL }],
		])
	})

	it("reads the connector status of an owner", async () => {
		hostInvoke.mockResolvedValue([{ name: "atlas", status: "connected" }])

		const rows = await connectorTransport.status(BOT)

		expect(hostInvoke).toHaveBeenCalledWith("mcp_connector_status", {
			owner: BOT,
		})
		expect(rows).toEqual([{ name: "atlas", status: "connected" }])
	})

	it("hands back what the host refused", async () => {
		hostInvoke.mockRejectedValue({ kind: "alreadyRunning" })

		await expect(connectorTransport.connect(BOT, "atlas", URL)).rejects.toEqual(
			{ kind: "alreadyRunning" },
		)
	})
})
