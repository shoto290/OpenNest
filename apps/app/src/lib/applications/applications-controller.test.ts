import { describe, expect, it, vi } from "vitest"

import type { Application } from "./application-port"
import {
	createApplicationsController,
	type InstallTarget,
} from "./applications-controller"
import { createFakeApplicationPort } from "./fake-application-port"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { EnvOwner } from "../conversations/store-contract"

const USER: EnvOwner = { kind: "user" }

const PAPER: Application = {
	name: "paper",
	title: "Paper",
	description: "Draws interfaces.",
	config: { command: "npx", args: ["-y", "@paper/mcp"] },
	tools: ["draw"],
	install: { kind: "nothing" },
}

const SUPERSET: Application = {
	name: "superset",
	title: "Superset",
	description: "Runs workspaces.",
	config: { type: "http", url: "https://api.superset.sh/mcp" },
	tools: ["tasks_list"],
	install: { kind: "key", name: "Authorization", secret: "SUPERSET_API_KEY" },
}

const LINEAR: Application = {
	name: "linear",
	title: "Linear",
	description: "Files issues.",
	config: { type: "http", url: "https://mcp.linear.app/mcp" },
	tools: ["list_issues"],
	install: { kind: "oauth" },
}

const targetOf = (overrides: Partial<InstallTarget> = {}): InstallTarget => ({
	owner: USER,
	connect: async () => undefined,
	settle: async () => undefined,
	...overrides,
})

const controllerOn = (
	port = createFakeApplicationPort(),
	store = createFakeTranscriptStore(),
) =>
	createApplicationsController(port, store, {
		reportFailure: () => undefined,
	})

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("applications controller", () => {
	it("opens on the curated applications the host answers", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER, SUPERSET]
		const controller = controllerOn(port)

		await controller.open()

		expect(controller.getState().curated).toEqual([PAPER, SUPERSET])
	})

	it("reads the catalogue once for every panel that opens it", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const controller = controllerOn(port)

		await controller.open()
		await controller.open()

		expect(port.calls).toEqual([{ command: "catalogue" }])
	})

	it("reports a catalogue it could not read", async () => {
		const port = createFakeApplicationPort()
		port.refusals.catalogue = { kind: "catalogueUnreadable", detail: "gone" }
		const reportFailure = vi.fn()
		const controller = createApplicationsController(
			port,
			createFakeTranscriptStore(),
			{ reportFailure },
		)

		await controller.open()

		expect(controller.getState().hasCatalogueFailed).toBe(true)
		expect(reportFailure).toHaveBeenCalledTimes(1)
	})

	it("searches the registry for what is typed", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const controller = controllerOn(port)

		controller.search("linear")
		expect(controller.getState().isSearching).toBe(true)
		await settled()

		expect(controller.getState().registry).toEqual([LINEAR])
		expect(controller.getState().isSearching).toBe(false)
	})

	it("keeps the answer of the last query and drops an earlier one", async () => {
		const port = createFakeApplicationPort()
		const answers = new Map([
			["lin", [PAPER]],
			["linear", [LINEAR]],
		])
		const pending: (() => void)[] = []
		port.search = (query) =>
			new Promise((resolve) => {
				pending.push(() => resolve(answers.get(query) ?? []))
			})
		const controller = controllerOn(port)

		controller.search("lin")
		controller.search("linear")
		const [answerFirst, answerLast] = pending
		answerLast?.()
		await settled()
		answerFirst?.()
		await settled()

		expect(controller.getState().registry).toEqual([LINEAR])
	})

	it("clears the registry when the query is emptied", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const controller = controllerOn(port)
		controller.search("linear")
		await settled()

		controller.search("")

		expect(controller.getState().registry).toEqual([])
		expect(controller.getState().isSearching).toBe(false)
	})

	it("reports a refused search and searches again on a retry", async () => {
		const port = createFakeApplicationPort()
		port.refusals.search = { kind: "registryTimedOut" }
		const controller = controllerOn(port)

		controller.search("linear")
		await settled()
		expect(controller.getState().hasSearchFailed).toBe(true)

		port.refusals = {}
		port.found = [LINEAR]
		controller.retry()
		await settled()

		expect(controller.getState().hasSearchFailed).toBe(false)
		expect(controller.getState().registry).toEqual([LINEAR])
	})

	it("declares a server for an install that asks nothing", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const store = createFakeTranscriptStore()
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("paper")

		await controller.install(targetOf())

		expect(await store.userPluginMcpServers()).toEqual([
			{ name: "paper", config: PAPER.config },
		])
		expect(controller.getState().installed).toEqual(["paper"])
	})

	it("writes the typed key under the secrets of the declared server", async () => {
		const port = createFakeApplicationPort()
		port.curated = [SUPERSET]
		const store = createFakeTranscriptStore()
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("superset")

		await controller.install(targetOf(), "sk-typed")

		const secrets = await store.environmentVariables({
			kind: "server",
			name: "superset",
			owner: USER,
		})
		expect(secrets.map((entry) => entry.name)).toEqual(["SUPERSET_API_KEY"])
	})

	it("runs the connect of the scope for an install that signs in", async () => {
		const port = createFakeApplicationPort()
		port.curated = [LINEAR]
		const controller = controllerOn(port)
		await controller.open()
		controller.pick("linear")
		const connect = vi.fn(async () => undefined)

		await controller.install(targetOf({ connect }))

		expect(connect).toHaveBeenCalledWith("linear", "https://mcp.linear.app/mcp")
	})

	it("shows the reason of a refused declaration and keeps the page open", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "setUserPluginMcpServer").mockRejectedValue({
			kind: "store",
			detail: "the bundle is read only",
		})
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("paper")

		await controller.install(targetOf())

		expect(controller.getState().failure).toContain("the bundle is read only")
		expect(controller.getState().picked).toEqual(PAPER)
		expect(controller.getState().installed).toEqual([])
	})

	it("refuses a second add of the application it is installing", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const store = createFakeTranscriptStore()
		const declare = vi.spyOn(store, "setUserPluginMcpServer")
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("paper")

		const running = controller.install(targetOf())
		await controller.install(targetOf())
		await running

		expect(declare).toHaveBeenCalledTimes(1)
	})

	it("settles the scope once the install lands", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const controller = controllerOn(port)
		await controller.open()
		controller.pick("paper")
		const settle = vi.fn(async () => undefined)

		await controller.install(targetOf({ settle }))

		expect(settle).toHaveBeenCalledTimes(1)
	})

	it("leaves the install page without forgetting the search", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		port.found = [LINEAR]
		const controller = controllerOn(port)
		await controller.open()
		controller.search("linear")
		await settled()
		controller.pick("paper")

		controller.leave()

		expect(controller.getState().picked).toBeNull()
		expect(controller.getState().query).toBe("linear")
		expect(controller.getState().registry).toEqual([LINEAR])
	})
})
