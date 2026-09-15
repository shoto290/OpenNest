import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Application, ApplicationsError } from "./application-port"
import { applicationTransport, INSTALLED_EVENT } from "./application-transport"
import { createFakeApplicationPort } from "./fake-application-port"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

const hostListen = vi.mocked(listen)

const SUPERSET: Application = {
	name: "superset",
	title: "Superset",
	description: "Run workspaces, terminals, agents and tasks.",
	config: { type: "http", url: "https://api.superset.sh/mcp" },
	tools: ["tasks_list"],
	logo: "<svg/>",
	install: { kind: "key", name: "Authorization", secret: "SUPERSET_API_KEY" },
}

const NOTION: Application = {
	name: "com.notion/mcp",
	title: "Notion",
	description: "Notion workspace.",
	config: { type: "http", url: "https://mcp.notion.com/mcp" },
	tools: [],
	install: { kind: "oauth" },
}

const REFUSED: ApplicationsError = { kind: "registryRefused", status: 503 }

beforeEach(() => {
	hostInvoke.mockReset()
	hostListen.mockReset()
})

describe("applicationTransport", () => {
	it("reads the curated catalogue", async () => {
		hostInvoke.mockResolvedValue([SUPERSET])

		const curated = await applicationTransport.catalogue()

		expect(hostInvoke).toHaveBeenCalledWith("application_catalogue")
		expect(curated).toEqual([SUPERSET])
	})

	it("hands the host the query to search the registry", async () => {
		hostInvoke.mockResolvedValue([NOTION])

		const found = await applicationTransport.search("notion")

		expect(hostInvoke).toHaveBeenCalledWith("application_search", {
			query: "notion",
		})
		expect(found).toEqual([NOTION])
	})

	it("hands back what the host refused", async () => {
		hostInvoke.mockRejectedValue(REFUSED)

		await expect(applicationTransport.search("notion")).rejects.toEqual(REFUSED)
	})

	it("hands on the payload of an install the host announced", async () => {
		const unsubscribe = vi.fn()
		hostListen.mockResolvedValue(unsubscribe)
		const onInstalled = vi.fn()

		const stop = await applicationTransport.onInstalled(onInstalled)
		const [event, handler] = hostListen.mock.calls[0] ?? []
		handler?.({
			event: INSTALLED_EVENT,
			id: 1,
			payload: { application: "linear", scope: "user" },
		})

		expect(event).toBe("application://installed")
		expect(onInstalled).toHaveBeenCalledWith({
			application: "linear",
			scope: "user",
		})
		expect(stop).toBe(unsubscribe)
	})
})

describe("createFakeApplicationPort", () => {
	it("answers what it holds and records every call", async () => {
		const fake = createFakeApplicationPort()
		fake.curated = [SUPERSET]
		fake.found = [NOTION]

		expect(await fake.catalogue()).toEqual([SUPERSET])
		expect(await fake.search("notion")).toEqual([NOTION])
		expect(fake.calls).toEqual([
			{ command: "catalogue" },
			{ command: "search", query: "notion" },
		])
	})

	it("throws the refusal it was given", async () => {
		const fake = createFakeApplicationPort()
		fake.refusals.search = REFUSED

		await expect(fake.search("notion")).rejects.toEqual(REFUSED)
	})
})
