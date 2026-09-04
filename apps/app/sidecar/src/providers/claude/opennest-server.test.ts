import { describe, expect, it } from "bun:test"

import {
	DELEGATE_TOOL,
	OPENNEST_SERVER,
	opennestServer,
	opennestTools,
} from "./opennest-server"

const scope = { cwd: "/tmp", managedSettings: {}, session: "k1" }

describe("opennestServer", () => {
	it("bridges one in-process server under the name its tools answer to", () => {
		const servers = opennestServer(scope)

		expect(Object.keys(servers)).toEqual([OPENNEST_SERVER])
		expect(servers[OPENNEST_SERVER]?.type).toBe("sdk")
		expect(DELEGATE_TOOL).toBe(`mcp__${OPENNEST_SERVER}__delegate`)
	})

	it("carries the delegate tool and every routine tool of the session", () => {
		expect(opennestTools(scope).map((held) => held.name)).toEqual([
			"delegate",
			"routine_list",
			"routine_trigger_sources",
			"routine_create",
			"routine_update",
			"routine_run_now",
			"routine_delete",
		])
	})
})
