import { describe, expect, it, vi } from "vitest"

import type { Application } from "./application-port"
import {
	applicationTitleOf,
	openedServerScope,
	toApplicationScope,
	toInstallableApplication,
	withApplicationMarks,
} from "./application-settings"
import {
	type ApplicationsController,
	type ApplicationsState,
	initialApplicationsState,
} from "./applications-controller"

import type { McpServers } from "../bots/use-mcp-servers"
import type { Connectors } from "../connectors/use-connectors"
import type { BotMcpServer, EnvOwner } from "../conversations/store-contract"

const USER: EnvOwner = { kind: "user" }

const LINEAR: Application = {
	name: "linear",
	title: "Linear",
	description: "Files issues.",
	config: { type: "http", url: "https://mcp.linear.app/mcp" },
	tools: ["list_issues", "create_issue"],
	logo: "<svg viewBox='0 0 1 1'/>",
	install: { kind: "oauth" },
}

const REGISTERED: Application = {
	name: "io.github.kwn/tasklog",
	title: "io.github.kwn/tasklog",
	description: "Tracks tasks.",
	config: { command: "npx", args: ["-y", "@kwn/tasklog"] },
	tools: [],
	install: { kind: "nothing" },
}

const applicationsWith = (state: Partial<ApplicationsState>) => ({
	state: { ...initialApplicationsState, ...state },
	controller: {
		search: vi.fn(),
		retry: vi.fn(),
		pick: vi.fn(),
		leave: vi.fn(),
		install: vi.fn(async () => undefined),
	} as unknown as ApplicationsController,
})

const serversWith = (
	owner: EnvOwner | null,
	servers: BotMcpServer[] = [],
): McpServers => ({
	state: { owner, servers, hasFailedToLoad: false },
	controller: {
		create: vi.fn(async () => true),
		rename: vi.fn(async () => true),
		remove: vi.fn(async () => true),
		reload: vi.fn(async () => undefined),
	} as unknown as McpServers["controller"],
})

const NO_CONNECTORS = {
	state: { owner: null, rows: [], connecting: null, failure: null },
	controller: {
		connect: vi.fn(async () => undefined),
		disconnect: vi.fn(async () => undefined),
		cancel: vi.fn(async () => undefined),
		getState: () => ({
			owner: null,
			rows: [],
			connecting: null,
			failure: null,
		}),
	} as unknown as Connectors["controller"],
} as Connectors

const scopeOf = (
	applications = applicationsWith({ curated: [LINEAR] }),
	servers = serversWith(USER),
	reopen = vi.fn(async () => undefined),
) => ({
	scope: toApplicationScope({
		applications,
		servers,
		connectors: NO_CONNECTORS,
		openedName: null,
		reopen,
	}),
	applications,
	servers,
	reopen,
})

describe("withApplicationMarks", () => {
	it("names a declared server after the curated application it carries", () => {
		const marked = withApplicationMarks(
			[
				{ name: "linear", config: {} },
				{ name: "atlas", config: {} },
			],
			[LINEAR],
		)

		expect(marked).toEqual([
			{
				name: "linear",
				config: {},
				displayName: "Linear",
				mark: LINEAR.logo,
			},
			{ name: "atlas", config: {} },
		])
	})
})

describe("toInstallableApplication", () => {
	it("hands the install page the tools of the descriptor and no reach", () => {
		const installable = toInstallableApplication(LINEAR)

		expect(installable).toMatchObject({
			id: "linear",
			name: "Linear",
			packageIdentity: "linear",
			setup: "signIn",
			tools: ["list_issues", "create_issue"],
		})
		expect(installable.canWrite).toBeUndefined()
	})

	it("reads the setup out of what the install asks", () => {
		expect(toInstallableApplication(REGISTERED).setup).toBe("none")
		expect(
			toInstallableApplication({
				...REGISTERED,
				install: { kind: "key", name: "Authorization", secret: "KEY" },
			}).setup,
		).toBe("apiKey")
	})
})

describe("applicationTitleOf", () => {
	it("falls back to the declared name outside the catalogue", () => {
		expect(applicationTitleOf([LINEAR], "linear")).toBe("Linear")
		expect(applicationTitleOf([LINEAR], "atlas")).toBe("atlas")
	})
})

describe("openedServerScope", () => {
	it("answers nothing without a name or an owner", () => {
		expect(openedServerScope(null, USER)).toBeNull()
		expect(openedServerScope("linear", null)).toBeNull()
		expect(openedServerScope("linear", USER)).toEqual({
			kind: "server",
			name: "linear",
			owner: USER,
		})
	})
})

describe("toApplicationScope", () => {
	it("lists the curated applications of the catalogue", () => {
		const { scope } = scopeOf()

		expect(scope.mcpCatalogue?.curated).toEqual([
			{
				id: "linear",
				name: "Linear",
				description: "Files issues.",
				setup: "signIn",
				mark: LINEAR.logo,
			},
		])
	})

	it("keeps only what the typed query matches among the curated ones", () => {
		const { scope } = scopeOf(
			applicationsWith({ curated: [LINEAR, REGISTERED], query: "tasklog" }),
		)

		expect(scope.mcpCatalogue?.curated.map((held) => held.id)).toEqual([
			"io.github.kwn/tasklog",
		])
	})

	it("hands no catalogue while the panel has no owner open", () => {
		const { scope } = scopeOf(
			applicationsWith({ curated: [LINEAR] }),
			serversWith(null),
		)

		expect(scope.mcpCatalogue).toBeUndefined()
	})

	it("reads the installed state off what the owner already declares", () => {
		const { scope } = scopeOf(
			applicationsWith({ curated: [LINEAR], picked: LINEAR }),
			serversWith(USER, [{ name: "linear", config: {} }]),
		)

		expect(scope.mcpCatalogue?.install?.isInstalled).toBe(true)
	})

	it("offers an application no declaration of this owner names", () => {
		const { scope } = scopeOf(
			applicationsWith({ curated: [LINEAR], picked: LINEAR }),
			serversWith(USER, [{ name: "atlas", config: {} }]),
		)

		expect(scope.mcpCatalogue?.install?.isInstalled).toBe(false)
	})

	it("pushes the install page of the picked application", () => {
		const { scope } = scopeOf(
			applicationsWith({
				curated: [LINEAR],
				picked: LINEAR,
				installing: "linear",
			}),
		)

		expect(scope.mcpCatalogue?.install).toMatchObject({
			isInstalling: true,
			isInstalled: false,
		})
		expect(scope.mcpCatalogue?.install?.application.name).toBe("Linear")
	})

	it("reopens the sessions of the scope once a server is declared", async () => {
		const { scope, reopen } = scopeOf()

		scope.onMcpServerCreate("linear", {})
		await Promise.resolve()
		await Promise.resolve()

		expect(reopen).toHaveBeenCalledWith({
			scope: { kind: "user" },
			application: "Linear",
		})
	})

	it("leaves the sessions alone when the declaration was refused", async () => {
		const servers = serversWith(USER)
		servers.controller.create = vi.fn(async () => false)
		const { scope, reopen } = scopeOf(
			applicationsWith({ curated: [LINEAR] }),
			servers,
		)

		scope.onMcpServerCreate("linear", {})
		await Promise.resolve()
		await Promise.resolve()

		expect(reopen).not.toHaveBeenCalled()
	})
})
