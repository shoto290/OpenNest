// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react"
import { createElement, useEffect, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SpaceSettingsDialog } from "@workspace/ui/components/space-settings-dialog"
import "@workspace/ui/lib/i18n"

import { CONNECTORS_TAB, toConnectorSettings } from "./connector-settings"
import {
	createFakeConnectorPort,
	type FakeConnectorPort,
} from "./fake-connector-port"
import { useConnectors } from "./use-connectors"

import type { BotMcpServer, EnvOwner } from "../conversations/store-contract"

const SPACE: EnvOwner = { kind: "space", id: "s-1" }

const ATLAS_URL = "https://mcp.atlas.test/mcp"

const SERVERS: BotMcpServer[] = [
	{ name: "atlas", config: { type: "http", url: ATLAS_URL } },
	{ name: "ledger", config: { command: "ledger-mcp" } },
]

type SpaceConnectorsProps = {
	port: FakeConnectorPort
	onSettled?: () => void
}

const SpaceConnectors = ({ port, onSettled }: SpaceConnectorsProps) => {
	const connectors = useConnectors(port)
	const [openedName, setOpenedName] = useState<string | null>(null)

	useEffect(() => {
		void connectors.controller.open(SPACE)
	}, [connectors.controller])

	return createElement(SpaceSettingsDialog, {
		...toConnectorSettings({
			servers: SERVERS,
			connectors,
			openedName,
			onSettled,
		}),
		environment: [],
		history: { days: [], oldestDate: "", onUndo: vi.fn() },
		onClose: vi.fn(),
		onDelete: vi.fn(),
		onEnvironmentDelete: vi.fn(),
		onEnvironmentSet: vi.fn(),
		onMcpServerChange: vi.fn(),
		onMcpServerCreate: vi.fn(),
		onMcpServerDelete: vi.fn(),
		onMcpServerOpen: setOpenedName,
		onSkillChange: vi.fn(),
		onSkillCreate: vi.fn(),
		onSkillDelete: vi.fn(),
		onSkillPreloadedChange: vi.fn(),
		onValueChange: vi.fn(),
		open: true,
		skills: [],
		tab: CONNECTORS_TAB,
		value: { name: "Release desk", colour: "blue" },
	})
}

const settle = () =>
	act(async () => {
		for (let round = 0; round < 20; round += 1) {
			await Promise.resolve()
		}
	})

const mounted = async (port: FakeConnectorPort, onSettled?: () => void) => {
	render(createElement(SpaceConnectors, { port, onSettled }))
	await settle()
	return screen.getByRole("tabpanel", { name: "Applications" })
}

const press = async (name: string, container: HTMLElement = document.body) => {
	fireEvent.click(within(container).getByRole("button", { name }))
	await settle()
}

const rowOf = (name: string) => {
	const row = screen.getByText(name).closest("li")
	if (!row) {
		throw new Error(`no row for ${name}`)
	}
	return row
}

const lastCall = (port: FakeConnectorPort) => port.calls.at(-1)

const connectorPort = (status: "needsAuthorization" | "connected") => {
	const port = createFakeConnectorPort()
	port.rows.space = [
		{ name: "atlas", status },
		{ name: "ledger", status: "unknown" },
	]
	return port
}

afterEach(cleanup)

describe("space connectors", () => {
	it("opens on its Connectors tab and reads the status of the space", async () => {
		const port = connectorPort("needsAuthorization")

		await mounted(port)

		expect(port.calls).toEqual([{ command: "status", owner: SPACE }])
		expect(within(rowOf("atlas")).getByText("Needs authorization")).toBeTruthy()
	})

	it("leaves a connector it cannot read with no state and no action", async () => {
		await mounted(connectorPort("needsAuthorization"))

		const ledger = rowOf("ledger")

		expect(within(ledger).queryByText("Needs authorization")).toBeNull()
		expect(within(ledger).queryByText("Connected")).toBeNull()
		expect(within(ledger).getAllByRole("button")).toHaveLength(1)
	})

	it("connects from a row, shows it connecting, then reads the grant that landed", async () => {
		const port = connectorPort("needsAuthorization")
		await mounted(port)

		await press("Connect atlas")

		expect(lastCall(port)).toEqual({
			command: "connect",
			owner: SPACE,
			name: "atlas",
			url: ATLAS_URL,
		})
		expect(within(rowOf("atlas")).getByText("Connecting…")).toBeTruthy()

		port.rows.space = [{ name: "atlas", status: "connected" }]
		port.grant()
		await settle()

		expect(lastCall(port)).toEqual({ command: "status", owner: SPACE })
		expect(within(rowOf("atlas")).getByText("Connected")).toBeTruthy()
	})

	it("cancels a running flow from the editor and reads the status again", async () => {
		const port = connectorPort("needsAuthorization")
		await mounted(port)
		await press("Connect atlas")

		await press("Open atlas")

		expect(screen.getByText(/A tab is open at mcp\.atlas\.test/)).toBeTruthy()

		await press("Cancel")

		expect(port.calls.map((call) => call.command)).toEqual([
			"status",
			"connect",
			"cancel",
			"status",
			"status",
		])
		expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull()
		expect(screen.getByRole("button", { name: "Connect" })).toBeTruthy()
	})

	it("disconnects once the person confirms, then reads the status again", async () => {
		const port = connectorPort("connected")
		await mounted(port)
		await press("Open atlas")

		await press("Disconnect")
		await press("Disconnect", screen.getByRole("alertdialog"))

		expect(port.calls.slice(-2)).toEqual([
			{ command: "disconnect", owner: SPACE, name: "atlas", url: ATLAS_URL },
			{ command: "status", owner: SPACE },
		])
	})

	it("says a connect landed once the grant is read", async () => {
		const port = connectorPort("needsAuthorization")
		const onSettled = vi.fn()
		await mounted(port, onSettled)

		await press("Connect atlas")
		expect(onSettled).not.toHaveBeenCalled()

		port.rows.space = [{ name: "atlas", status: "connected" }]
		port.grant()
		await settle()

		expect(onSettled).toHaveBeenCalledTimes(1)
	})

	it("says nothing landed when the connect was refused", async () => {
		const port = connectorPort("needsAuthorization")
		port.refusals.connect = { kind: "denied", detail: "access_denied" }
		const onSettled = vi.fn()
		await mounted(port, onSettled)

		await press("Connect atlas")

		expect(onSettled).not.toHaveBeenCalled()
	})

	it("says nothing landed when the connect ended unauthorized", async () => {
		const port = connectorPort("needsAuthorization")
		const onSettled = vi.fn()
		await mounted(port, onSettled)

		await press("Connect atlas")
		port.grant()
		await settle()

		expect(within(rowOf("atlas")).getByText("Needs authorization")).toBeTruthy()
		expect(onSettled).not.toHaveBeenCalled()
	})

	it("says a disconnect landed once it is confirmed", async () => {
		const port = connectorPort("connected")
		const onSettled = vi.fn()
		await mounted(port, onSettled)
		await press("Open atlas")
		port.rows.space = [{ name: "atlas", status: "needsAuthorization" }]

		await press("Disconnect")
		await press("Disconnect", screen.getByRole("alertdialog"))

		expect(onSettled).toHaveBeenCalledTimes(1)
	})

	it("says nothing landed when the server is still connected", async () => {
		const port = connectorPort("connected")
		const onSettled = vi.fn()
		await mounted(port, onSettled)
		await press("Open atlas")

		await press("Disconnect")
		await press("Disconnect", screen.getByRole("alertdialog"))

		expect(onSettled).not.toHaveBeenCalled()
	})

	it("shows a refused connect as a connector that could not connect", async () => {
		const port = connectorPort("needsAuthorization")
		port.refusals.connect = { kind: "denied", detail: "access_denied" }
		await mounted(port)

		await press("Connect atlas")

		const atlas = rowOf("atlas")
		expect(within(atlas).getByText("Couldn’t connect")).toBeTruthy()
		expect(
			within(atlas).getByRole("button", { name: "Retry atlas" }),
		).toBeTruthy()
	})
})
