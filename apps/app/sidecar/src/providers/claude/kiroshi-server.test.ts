import { describe, expect, it } from "bun:test"

import {
	DELEGATE_TOOL,
	KIROSHI_SERVER,
	kiroshiServer,
	kiroshiTools,
} from "./kiroshi-server"

const scope = { cwd: "/tmp", managedSettings: {}, session: "k1" }

const NAMES_A_SECRET = /key|secret|token|password|credential|value|header/i

describe("kiroshiServer", () => {
	it("bridges one in-process server under the name its tools answer to", () => {
		const servers = kiroshiServer(scope)

		expect(Object.keys(servers)).toEqual([KIROSHI_SERVER])
		expect(servers[KIROSHI_SERVER]?.type).toBe("sdk")
		expect(DELEGATE_TOOL).toBe(`mcp__${KIROSHI_SERVER}__delegate`)
	})

	it("carries the three connector tools and none of them takes a secret value", () => {
		const connectors = kiroshiTools(scope).filter((held) =>
			held.name.startsWith("connector_"),
		)

		expect(connectors.map((held) => held.name)).toEqual([
			"connector_search",
			"connector_install",
			"connector_status",
		])
		for (const held of connectors) {
			for (const field of Object.keys(held.inputSchema)) {
				expect(field).not.toMatch(NAMES_A_SECRET)
			}
		}
	})

	it("carries the delegate tool and every routine, mission, connector and companion tool of the session", () => {
		expect(kiroshiTools(scope).map((held) => held.name)).toEqual([
			"delegate",
			"routine_list",
			"routine_trigger_sources",
			"routine_create",
			"routine_update",
			"routine_run_now",
			"routine_delete",
			"mission_open",
			"mission_note",
			"mission_escalate",
			"mission_close",
			"mission_watch",
			"mission_list",
			"connector_search",
			"connector_install",
			"connector_status",
			"companion_suggestions",
			"companion_create",
			"companion_first_run_done",
			"companion_invite",
		])
	})
})
