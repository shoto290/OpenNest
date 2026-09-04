import { describe, expect, it } from "bun:test"

import {
	askHost,
	closeHostChannel,
	type HostError,
	HostRefusal,
	openHostChannel,
	settleHostAnswer,
} from "./host"

import type { SessionFrame } from "./providers/provider"

type Served = { result?: unknown; error?: HostError }

const A_ROUTINE = {
	id: "r1",
	conversationId: "c1",
	botId: "b1",
	title: "Nightly report",
}

const served = (request: Record<string, unknown>): Served => {
	if (request.subtype !== "routine") {
		return { error: { kind: "unreadableRequest", detail: "unknown subtype" } }
	}
	switch (request.operation) {
		case "list":
			return { result: [A_ROUTINE] }
		case "create":
			return { result: A_ROUTINE }
		case "update":
			return { result: { ...A_ROUTINE, title: "Renamed" } }
		case "runNow":
			return { result: { kind: "started", runId: "run-1" } }
		case "delete":
			return { result: null }
		default:
			return {
				error: { kind: "unreadableRequest", detail: "unknown operation" },
			}
	}
}

const aHost = (session: string) => {
	const frames: SessionFrame[] = []
	openHostChannel(session, (frame) => {
		frames.push(frame)
		const { requestId, request } = frame as {
			requestId: string
			request: Record<string, unknown>
		}
		settleHostAnswer(session, { requestId, ...served(request) })
	})
	return frames
}

const aSilentHost = (session: string) => {
	const frames: SessionFrame[] = []
	const emit = openHostChannel(session, (frame) => {
		frames.push(frame)
	})
	return { frames, emit }
}

describe("the host channel", () => {
	it("carries every routine operation to the host and resolves with its answer", async () => {
		const frames = aHost("k1")

		const listed = await askHost("k1", {
			subtype: "routine",
			operation: "list",
		})
		const created = await askHost("k1", {
			subtype: "routine",
			operation: "create",
			payload: { title: "Nightly report" },
		})
		const updated = await askHost("k1", {
			subtype: "routine",
			operation: "update",
			payload: { id: "r1", title: "Renamed" },
		})
		const ran = await askHost("k1", {
			subtype: "routine",
			operation: "runNow",
			payload: { id: "r1" },
		})
		const deleted = await askHost("k1", {
			subtype: "routine",
			operation: "delete",
			payload: { id: "r1" },
		})

		expect(listed).toEqual([A_ROUTINE])
		expect(created).toEqual(A_ROUTINE)
		expect(updated).toEqual({ ...A_ROUTINE, title: "Renamed" })
		expect(ran).toEqual({ kind: "started", runId: "run-1" })
		expect(deleted).toBeNull()
		expect(frames).toHaveLength(5)
		expect(frames.every((frame) => frame.type === "host_request")).toBe(true)
		expect(new Set(frames.map((frame) => frame.requestId)).size).toBe(5)

		closeHostChannel("k1")
	})

	it("rejects with the error the host answered", async () => {
		openHostChannel("k2", (frame) => {
			const { requestId } = frame as { requestId: string }
			settleHostAnswer("k2", {
				requestId,
				error: { kind: "routineOfAnotherBot", id: "r1", botId: "b1" },
			})
		})

		const refused = await askHost("k2", {
			subtype: "routine",
			operation: "delete",
			payload: { id: "r1" },
		}).catch((error: unknown) => error)

		expect(refused).toBeInstanceOf(HostRefusal)
		expect((refused as HostRefusal).error).toEqual({
			kind: "routineOfAnotherBot",
			id: "r1",
			botId: "b1",
		})

		closeHostChannel("k2")
	})

	it("settles a request the host never answered when the session closes", async () => {
		const { frames } = aSilentHost("k3")

		const asking = askHost("k3", { subtype: "routine", operation: "list" })
		closeHostChannel("k3")
		const refused = await asking.catch((error: unknown) => error)

		expect(frames).toHaveLength(1)
		expect(refused).toBeInstanceOf(HostRefusal)
		expect((refused as HostRefusal).error.kind).toBe("undeliverable")
	})

	it("settles a request the session left awaiting when it emits a closed frame", async () => {
		const { emit } = aSilentHost("k4")

		const asking = askHost("k4", { subtype: "routine", operation: "list" })
		emit({ type: "closed", detail: "the query threw" })
		const refused = await asking.catch((error: unknown) => error)

		expect(refused).toBeInstanceOf(HostRefusal)
		expect((refused as HostRefusal).error.kind).toBe("undeliverable")
		expect(
			await askHost("k4", { subtype: "routine", operation: "list" }).catch(
				(error: unknown) => error,
			),
		).toBeInstanceOf(HostRefusal)
	})

	it("settles what the channel it replaces was still awaiting", async () => {
		aSilentHost("k5")

		const asking = askHost("k5", { subtype: "routine", operation: "list" })
		const { frames } = aSilentHost("k5")
		const refused = await asking.catch((error: unknown) => error)

		expect(refused).toBeInstanceOf(HostRefusal)
		expect((refused as HostRefusal).error.kind).toBe("undeliverable")
		expect(frames).toHaveLength(0)

		closeHostChannel("k5")
	})

	it("refuses a request for a session that holds no channel", async () => {
		const refused = await askHost("never-opened", {
			subtype: "routine",
			operation: "list",
		}).catch((error: unknown) => error)

		expect(refused).toBeInstanceOf(HostRefusal)
		expect((refused as HostRefusal).error.kind).toBe("undeliverable")
	})
})
