import { describe, expect, it } from "vitest"

import {
	type AttachmentsHosts,
	createAttachmentsPort,
} from "./attachments-port"

import type { ConversationController } from "../conversations/conversation-controller"

const heldHosts = () => {
	const sentToBots: { botId: string; text: string }[] = []
	const sentToRooms: { text: string; repliedToMessageId?: string }[] = []
	const runtimes = new Map<string, ConversationController>()

	const runtime = {
		send: (text: string, repliedToMessageId?: string) => {
			sentToRooms.push({ text, repliedToMessageId })
			return Promise.resolve()
		},
	} as ConversationController

	const hosts: AttachmentsHosts = {
		chat: {
			storeAttachments: () => Promise.resolve([]),
			sendTo: (botId, text) => {
				sentToBots.push({ botId, text })
				return Promise.resolve()
			},
		},
		runtimes: { heldFor: (id) => runtimes.get(id) ?? null },
	}

	return {
		hosts,
		sentToBots,
		sentToRooms,
		open: (conversationId: string) => runtimes.set(conversationId, runtime),
	}
}

describe("a draft owned by a bot", () => {
	it("goes through the bot chat", () => {
		const host = heldHosts()
		const port = createAttachmentsPort(host.hosts)

		expect(port.send({ kind: "bot", id: "a" }, "look")).toBe(true)
		expect(host.sentToBots).toEqual([{ botId: "a", text: "look" }])
	})
})

describe("a draft owned by a conversation", () => {
	it("goes through the runtime of that conversation", () => {
		const host = heldHosts()
		host.open("room")
		const port = createAttachmentsPort(host.hosts)

		expect(port.send({ kind: "conversation", id: "room" }, "look", "m1")).toBe(
			true,
		)
		expect(host.sentToRooms).toEqual([
			{ text: "look", repliedToMessageId: "m1" },
		])
	})

	it("goes nowhere when that conversation has no runtime", () => {
		const host = heldHosts()
		const port = createAttachmentsPort(host.hosts)

		expect(port.send({ kind: "conversation", id: "room" }, "look")).toBe(false)
		expect(host.sentToRooms).toEqual([])
		expect(host.sentToBots).toEqual([])
	})
})
