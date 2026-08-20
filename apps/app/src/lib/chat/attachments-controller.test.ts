import { describe, expect, it, vi } from "vitest"

import type { SubmittedAttachment } from "./attachments-contract"
import {
	type AttachmentsPort,
	createAttachmentsController,
} from "./attachments-controller"

const fileNamed = (name: string, type = "text/markdown") =>
	new File([new Uint8Array([1, 2, 3])], name, { type })

type Sent = { botId: string; text: string }

/** A store the test holds open, so a submission can be caught mid-flight: the
 * round trip is where the reader goes on typing, staging and switching bots. */
const heldPort = () => {
	const stored: { botId: string; names: string[] }[] = []
	const sent: Sent[] = []
	let answer: ((paths: string[]) => void) | null = null
	let refuse: ((reason: unknown) => void) | null = null
	let reached: (() => void) | null = null

	const port: AttachmentsPort = {
		store: (botId: string, attachments: SubmittedAttachment[]) => {
			stored.push({
				botId,
				names: attachments.map((attachment) => attachment.name),
			})
			reached?.()
			return new Promise<string[]>((resolve, reject) => {
				answer = resolve
				refuse = reject
			})
		},
		send: (botId: string, text: string) => {
			sent.push({ botId, text })
			return Promise.resolve()
		},
	}

	return {
		port,
		stored,
		sent,
		// The files are read before the store is called, so a test that answers one
		// has to wait for the call it is answering.
		whenStored: () =>
			new Promise<void>((resolve) => {
				if (stored.length > 0) {
					resolve()
					return
				}
				reached = resolve
			}),
		answerWith: (paths: string[]) => answer?.(paths),
		refuseWith: (reason: unknown) => refuse?.(reason),
	}
}

describe("a submission in flight", () => {
	it("refuses a second one and stores nothing twice", async () => {
		const host = heldPort()
		const controller = createAttachmentsController(host.port)
		controller.stage("a", [fileNamed("notes.md")])

		const first = controller.submit("a", "look")
		const second = await controller.submit("a", "look")
		await host.whenStored()
		host.answerWith(["/data/a/1.md"])

		expect(second).toBe(false)
		expect(await first).toBe(true)
		expect(host.stored).toHaveLength(1)
		expect(host.sent).toEqual([{ botId: "a", text: "look\n/data/a/1.md" }])
	})

	it("delivers to the bot it started on, whoever is read meanwhile", async () => {
		const host = heldPort()
		const controller = createAttachmentsController(host.port)
		controller.stage("a", [fileNamed("notes.md")])

		const submission = controller.submit("a", "look")
		await host.whenStored()
		controller.stage("b", [fileNamed("other.md")])
		host.answerWith(["/data/a/1.md"])

		expect(await submission).toBe(true)
		expect(host.stored).toEqual([{ botId: "a", names: ["notes.md"] }])
		expect(host.sent).toEqual([{ botId: "a", text: "look\n/data/a/1.md" }])
		expect(controller.getState().staged.b?.map((item) => item.name)).toEqual([
			"other.md",
		])
	})

	it("clears the files it sent and keeps the ones staged meanwhile", async () => {
		const host = heldPort()
		const controller = createAttachmentsController(host.port)
		controller.stage("a", [fileNamed("notes.md")])

		const submission = controller.submit("a", "look")
		await host.whenStored()
		controller.stage("a", [fileNamed("late.md")])
		host.answerWith(["/data/a/1.md"])
		await submission

		expect(controller.getState().staged.a?.map((item) => item.name)).toEqual([
			"late.md",
		])
		expect(host.stored).toEqual([{ botId: "a", names: ["notes.md"] }])
	})
})

describe("a refused store", () => {
	it("is held against the bot it happened on and shown on no other", async () => {
		const host = heldPort()
		const controller = createAttachmentsController(host.port)
		controller.stage("a", [fileNamed("notes.md")])

		const submission = controller.submit("a", "look")
		await host.whenStored()
		host.refuseWith({ kind: "tooMany", count: 21, limit: 20 })

		expect(await submission).toBe(false)
		expect(controller.getState().refusals.a).toEqual({
			kind: "tooMany",
			count: 21,
			limit: 20,
		})
		expect(controller.getState().refusals.b ?? null).toBeNull()
		expect(controller.getState().staged.a).toHaveLength(1)
	})

	it("goes when the bot sends a prompt with nothing staged", async () => {
		const host = heldPort()
		const controller = createAttachmentsController(host.port)
		controller.stage("a", [fileNamed("notes.md")])
		const refused = controller.submit("a", "look")
		await host.whenStored()
		host.refuseWith({ kind: "unwritable", detail: "no space" })
		await refused
		controller.remove("a", controller.getState().staged.a?.[0]?.id ?? "")

		expect(await controller.submit("a", "never mind")).toBe(true)
		expect(controller.getState().refusals.a).toBeNull()
		expect(host.sent).toEqual([{ botId: "a", text: "never mind" }])
	})
})

describe("files that stop being reachable", () => {
	it("release their previews when the bot is forgotten", () => {
		const released = vi.spyOn(URL, "revokeObjectURL")
		const controller = createAttachmentsController(heldPort().port)
		controller.stage("a", [fileNamed("shot.png", "image/png")])
		const preview = controller.getState().staged.a?.[0]?.previewUrl

		controller.forget("a")

		expect(released).toHaveBeenCalledWith(preview)
		expect(controller.getState().staged.a).toHaveLength(0)
		released.mockRestore()
	})

	it("release their previews when the composer goes away", () => {
		const released = vi.spyOn(URL, "revokeObjectURL")
		const controller = createAttachmentsController(heldPort().port)
		controller.stage("a", [fileNamed("shot.png", "image/png")])
		controller.stage("b", [fileNamed("other.png", "image/png")])

		controller.release()

		expect(released).toHaveBeenCalledTimes(2)
		expect(controller.getState().staged).toEqual({})
		released.mockRestore()
	})
})
