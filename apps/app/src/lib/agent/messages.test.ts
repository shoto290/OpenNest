import { describe, expect, it } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import { describeTransportError } from "./messages"

const t = i18n.getFixedT(null, "chat")

describe("describeTransportError", () => {
	it("names the agent, not the places it was looked for", () => {
		expect(
			describeTransportError(t, {
				kind: "binaryNotFound",
				searched: ["/usr/bin", "/opt/bin"],
			}),
		).toBe("The OpenNest agent shipped with the app is unreachable.")
	})

	it("keeps a signed-out subscription apart from an unreachable agent", () => {
		expect(describeTransportError(t, { kind: "notAuthenticated" })).not.toBe(
			describeTransportError(t, { kind: "binaryNotFound", searched: [] }),
		)
	})

	it("names the exit code, and says so when the process left none", () => {
		expect(
			describeTransportError(t, { kind: "crashed", code: 1, detail: null }),
		).toBe("Claude Code exited (code 1).")
		expect(
			describeTransportError(t, { kind: "crashed", code: null, detail: null }),
		).toBe("Claude Code exited (code unknown).")
	})

	it("reads back a detail the host sent unescaped", () => {
		expect(
			describeTransportError(t, {
				kind: "writeFailed",
				detail: "pipe closed & gone",
			}),
		).toBe("The prompt could not be sent: pipe closed & gone")
	})

	it("names the folder a bot asked for and no longer has", () => {
		expect(
			describeTransportError(t, {
				kind: "workingDirectoryRefused",
				path: "/tmp/gone",
			}),
		).toBe(
			"/tmp/gone is not there any more. This bot is answering from the usual place instead.",
		)
	})
})
