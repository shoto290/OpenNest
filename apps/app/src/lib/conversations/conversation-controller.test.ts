import { beforeEach, describe, expect, it } from "vitest"

import {
	type ConversationController,
	createConversationController,
} from "./conversation-controller"
import { createFakeTranscriptStore } from "./fake-transcript-store"
import {
	createScriptedDriver,
	type ScriptedDriver,
	spoke,
} from "./scripted-driver"
import type { Conversation } from "./store-contract"
import type { TranscriptStore } from "./store-port"
import { seatBots } from "./transcript-fixtures"

import type { AgentEvent } from "../agent/contract"

const SPACE = "personal"

const SAID_NOTHING: AgentEvent[] = [
	{
		type: "messageStarted",
		message: {
			id: "msg-silent",
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: 1,
		},
	},
	{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
]

type Harness = {
	driver: ScriptedDriver
	contexts: [string, string][]
	store: TranscriptStore
	controller: ConversationController
	conversation: Conversation
	named: [string, string][]
	detach: () => void
	settled: () => Promise<void>
	refuseNextWrite: () => void
}

type Naming = {
	title: string
	titleFor: () => Promise<string | null>
}

const createHarness = async (
	names: string[],
	naming?: Partial<Naming>,
): Promise<Harness> => {
	const scripted = createScriptedDriver()
	const driver: ScriptedDriver = naming?.titleFor
		? { ...scripted, titleFor: naming.titleFor }
		: scripted
	const contexts: [string, string][] = []
	const base = createFakeTranscriptStore()
	let isRefusingNextWrite = false
	const store: TranscriptStore = {
		...base,
		appendUserMessage: (message) => {
			if (!isRefusingNextWrite) {
				return base.appendUserMessage(message)
			}
			isRefusingNextWrite = false
			return Promise.reject(new Error("refused"))
		},
		boundedContext: (conversationId, botId, promptMessageId) => {
			contexts.push([botId, promptMessageId])
			return base.boundedContext(conversationId, botId, promptMessageId)
		},
	}
	const refuseNextWrite = () => {
		isRefusingNextWrite = true
	}
	const bots = await seatBots(store, SPACE, names)
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: naming?.title ?? "Walls",
		botIds: bots.map((bot) => bot.id),
	})
	const named: [string, string][] = []
	let minted = 0
	const controller = createConversationController(driver, store, {
		newId: () => {
			minted += 1
			return `id-${minted}`
		},
		now: () => minted,
		onNamed: (conversationId, title) => named.push([conversationId, title]),
	})
	const detach = controller.attach()
	await controller.open(conversation)
	const settled = async () => {
		for (let round = 0; round < 20; round += 1) {
			await Promise.resolve()
		}
	}
	await settled()
	return {
		driver,
		contexts,
		store,
		controller,
		conversation,
		named,
		detach,
		settled,
		refuseNextWrite,
	}
}

const idOf = (conversation: Conversation, name: string) => {
	const seat = conversation.participants.find(
		(participant) => participant.name === name,
	)
	if (!seat) {
		throw new Error(`no seat for ${name}`)
	}
	return seat.botId
}

const refusingStore = (): TranscriptStore => ({
	...createFakeTranscriptStore(),
	pinMessage: () => Promise.reject(new Error("refused")),
})

const saidIn = async (harness: Harness) => {
	await harness.controller.send("and now?")
	await harness.settled()
	return harness.controller.getState().messages[0]
}

const spokenIn = (controller: ConversationController) =>
	controller
		.getState()
		.messages.map((message) => [message.authorBotId, message.content])

describe("createConversationController", () => {
	let harness: Harness

	beforeEach(async () => {
		harness = await createHarness(["Ada", "Nyx", "Iris"])
	})

	it("answers with the bot holding the lead when a message names nobody", async () => {
		await harness.controller.send("and now?")
		await harness.settled()

		expect(harness.driver.submissions).toHaveLength(1)
		expect(harness.driver.submissions[0].scope.botId).toBe(
			idOf(harness.conversation, "Ada"),
		)
	})

	it("stores the message carrying the tokens of the bots named", async () => {
		await harness.controller.send("@Nyx take the walls")
		await harness.settled()

		const nyx = idOf(harness.conversation, "Nyx")
		expect(spokenIn(harness.controller)).toContainEqual([
			null,
			`<@${nyx}> take the walls`,
		])
	})

	it("stores on the message sent the identifier of the message it answers", async () => {
		const said = await saidIn(harness)

		await harness.controller.send("and this?", said.id)
		await harness.settled()

		const answering = harness.controller.getState().messages.at(-1)
		expect(answering?.repliedToMessageId).toBe(said.id)

		const page = await harness.store.loadPage(harness.conversation.id, null)
		expect(
			page.messages.find((message) => message.id === answering?.id)
				?.repliedToMessageId,
		).toBe(said.id)
	})

	it("stores no identifier when the message sent answers nothing", async () => {
		const said = await saidIn(harness)

		expect(said.repliedToMessageId).toBeNull()
	})

	it("stores no identifier when the message answered sits in another conversation", async () => {
		const said = await saidIn(harness)
		const elsewhere = await harness.store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Roofs",
			botIds: harness.conversation.participants.map(({ botId }) => botId),
		})
		await harness.controller.open(elsewhere)
		await harness.settled()

		await harness.controller.send("and this?", said.id)
		await harness.settled()

		const answering = harness.controller.getState().messages.at(-1)
		expect(answering?.repliedToMessageId).toBeNull()
	})

	it("runs the bots named one at a time, in the order they are named", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		expect(harness.driver.submissions.map(({ scope }) => scope.botId)).toEqual([
			nyx,
		])
		expect(harness.controller.getState().waitingBotIds).toEqual([iris])

		harness.driver.pushTo(nyx, spoke(nyx, "walls up"))
		await harness.settled()

		expect(harness.driver.submissions.map(({ scope }) => scope.botId)).toEqual([
			nyx,
			iris,
		])
	})

	it("leaves no message of a bot that ended its turn writing nothing", async () => {
		const ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, SAID_NOTHING)
		await harness.settled()

		expect(spokenIn(harness.controller)).toEqual([[null, "and now?"]])
		expect(harness.controller.getState().speakingBotId).toBeNull()
	})

	it("puts the bot a speaker names at the end of the same turn", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, `over to <@${nyx}>`))
		await harness.settled()

		expect(harness.driver.submissions.map(({ scope }) => scope.botId)).toEqual([
			ada,
			nyx,
		])
	})

	it("puts the bot a speaker names in plain words at the end of the same turn", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, "over to @Nyx"))
		await harness.settled()

		expect(harness.driver.submissions.map(({ scope }) => scope.botId)).toEqual([
			ada,
			nyx,
		])
	})

	it("stores a settled reply with the name it wrote in token form", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, "over to @Nyx"))
		await harness.settled()

		expect(spokenIn(harness.controller)).toContainEqual([
			ada,
			`over to <@${nyx}>`,
		])
		const page = await harness.store.loadPage(harness.conversation.id, null)
		expect(page.messages.map((message) => message.content)).toContain(
			`over to <@${nyx}>`,
		)
	})

	it("leaves an arobase naming no seated bot as plain text", async () => {
		const ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, "write to @nobody"))
		await harness.settled()

		expect(spokenIn(harness.controller)).toContainEqual([
			ada,
			"write to @nobody",
		])
		expect(harness.driver.submissions.map(({ scope }) => scope.botId)).toEqual([
			ada,
		])
	})

	it("points a bot pulled in by another at the message that named it", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, `over to <@${nyx}>`))
		await harness.settled()

		const [said, named] = harness.controller.getState().messages
		expect(harness.contexts).toEqual([
			[ada, said.id],
			[nyx, named.id],
		])
	})

	it("points a bot the reader named at the message the reader sent", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		harness.driver.pushTo(nyx, spoke(nyx, "walls up"))
		await harness.settled()

		const said = harness.controller.getState().messages[0].id
		expect(harness.contexts).toEqual([
			[nyx, said],
			[iris, said],
		])
	})

	it("lets the bot in flight finish and drops those waiting when a message comes in", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		const ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		await harness.controller.send("@Ada instead")
		await harness.settled()

		expect(harness.controller.getState().speakingBotId).toBe(nyx)
		expect(harness.controller.getState().waitingBotIds).toEqual([ada])

		harness.driver.pushTo(nyx, spoke(nyx, "walls up"))
		await harness.settled()

		const spoken = harness.driver.submissions.map(({ scope }) => scope.botId)
		expect(spoken).toEqual([nyx, ada])
		expect(spoken).not.toContain(iris)
	})

	it("shows a notice naming the two bots that keep handing the turn over", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, `one <@${nyx}>`))
		await harness.settled()
		harness.driver.pushTo(nyx, spoke(nyx, `two <@${ada}>`))
		await harness.settled()
		expect(harness.controller.getState().loopingPair).toBeNull()

		harness.driver.pushTo(ada, spoke(ada, `three <@${nyx}>`))
		await harness.settled()

		expect(harness.controller.getState().loopingPair).toEqual([ada, nyx])
	})

	it("leaves what the bot in flight wrote in place when the turn is stopped", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		harness.driver.pushTo(nyx, [
			{
				type: "messageStarted",
				message: {
					id: "msg-half",
					role: "assistant",
					text: "",
					completion: "streaming",
					timestamp: 1,
				},
			},
			{ type: "messageDelta", id: "msg-half", seq: 1, text: "half a wall" },
		])
		await harness.settled()

		await harness.controller.stop()
		harness.driver.pushTo(nyx, [
			{ type: "turnEnded", ended: { sessionId: null, outcome: "cancelled" } },
		])
		await harness.settled()

		expect(harness.driver.cancelled).toEqual([nyx])
		expect(spokenIn(harness.controller)).toContainEqual([nyx, "half a wall"])
		expect(harness.driver.submissions.map(({ scope }) => scope.botId)).toEqual([
			nyx,
		])
		expect(harness.controller.getState().waitingBotIds).toEqual([])
	})

	it("writes every message with the bot that wrote it", async () => {
		const ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, "walls up"))
		await harness.settled()

		expect(spokenIn(harness.controller)).toEqual([
			[null, "and now?"],
			[ada, "walls up"],
		])
	})
	it("records against the open conversation the pin the reader lays", async () => {
		const said = await saidIn(harness)

		await harness.controller.pin(said.id, 0)

		const pinned = await harness.store.pinnedMessages(harness.conversation.id)
		expect(pinned.map((pin) => [pin.message.id, pin.blockIndex])).toEqual([
			[said.id, 0],
		])
	})

	it("drops from the store the pin the reader takes back", async () => {
		const said = await saidIn(harness)
		await harness.controller.pin(said.id, 0)

		await harness.controller.unpin(said.id, 0)

		expect(await harness.controller.pins()).toEqual([])
	})

	it("hands back the pins the store holds for the open conversation", async () => {
		const said = await saidIn(harness)
		await harness.controller.pin(said.id, 1)

		const pinned = await harness.controller.pins()

		expect(pinned.map((pin) => [pin.message.id, pin.blockIndex])).toEqual([
			[said.id, 1],
		])
	})

	it("pins nothing and holds no pin while no conversation is open", async () => {
		const controller = createConversationController(
			createScriptedDriver(),
			refusingStore(),
		)

		await expect(controller.pin("msg-1", 0)).resolves.toBeUndefined()

		expect(await controller.pins()).toEqual([])
	})

	it("keeps the message the store refused, with the message it answers", async () => {
		const said = await saidIn(harness)
		harness.refuseNextWrite()

		await harness.controller.send("and this?", said.id)
		await harness.settled()

		expect(harness.controller.getState().refusedMessage).toMatchObject({
			text: "and this?",
			repliedToMessageId: said.id,
		})
	})

	it("stores the message sent again and lets the seated bots answer it", async () => {
		harness.refuseNextWrite()
		await harness.controller.send("@Nyx take the walls")
		await harness.settled()
		const held = harness.controller.getState().refusedMessage

		await harness.controller.sendAgain(held?.id ?? "")
		await harness.settled()

		const nyx = idOf(harness.conversation, "Nyx")
		expect(spokenIn(harness.controller)).toContainEqual([
			null,
			`<@${nyx}> take the walls`,
		])
		expect(harness.driver.submissions[0].scope.botId).toBe(nyx)
	})

	it("keeps no refused message once a message the reader sends is stored", async () => {
		harness.refuseNextWrite()
		await harness.controller.send("and now?")
		await harness.settled()

		await harness.controller.send("and this?")
		await harness.settled()

		expect(harness.controller.getState().refusedMessage).toBeNull()
	})

	it("keeps only the last message the store refused", async () => {
		harness.refuseNextWrite()
		await harness.controller.send("and now?")
		harness.refuseNextWrite()

		await harness.controller.send("and this?")
		await harness.settled()

		expect(harness.controller.getState().refusedMessage).toMatchObject({
			text: "and this?",
		})
	})

	it("keeps no refused message when the reader opens another conversation", async () => {
		harness.refuseNextWrite()
		await harness.controller.send("and now?")
		await harness.settled()
		const elsewhere = await harness.store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Roofs",
			botIds: harness.conversation.participants.map(({ botId }) => botId),
		})

		await harness.controller.open(elsewhere)
		await harness.settled()

		expect(harness.controller.getState().refusedMessage).toBeNull()
	})

	it("stores nothing when the message to send again is not the one refused", async () => {
		harness.refuseNextWrite()
		await harness.controller.send("and now?")
		await harness.settled()

		await harness.controller.sendAgain("id-unknown")
		await harness.settled()

		expect(spokenIn(harness.controller)).toEqual([])
		expect(harness.driver.submissions).toHaveLength(0)
	})

	it("leaves the conversation as it stands when the store refuses a pin", async () => {
		const store = refusingStore()
		const bots = await seatBots(store, SPACE, ["Ada"])
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: bots.map((bot) => bot.id),
		})
		const controller = createConversationController(
			createScriptedDriver(),
			store,
		)
		await controller.open(conversation)
		const standing = controller.getState()

		await expect(controller.pin("msg-1", 0)).rejects.toThrow("refused")

		expect(controller.getState()).toBe(standing)
	})
})

describe("naming a conversation from its first message", () => {
	const namelessWith = (titleFor: () => Promise<string | null>) =>
		createHarness(["Ada"], { title: "", titleFor })

	it("keeps the title the runtime reads in the first message", async () => {
		const harness = await namelessWith(() =>
			Promise.resolve("Holding the walls"),
		)

		await harness.controller.send("how do we hold the walls?")
		await harness.settled()

		expect(harness.named).toEqual([
			[harness.conversation.id, "Holding the walls"],
		])
	})

	it("asks the runtime for a title once, on the first message alone", async () => {
		let asked = 0
		const harness = await namelessWith(() => {
			asked += 1
			return Promise.resolve("Holding the walls")
		})

		await harness.controller.send("how do we hold the walls?")
		await harness.settled()
		await harness.controller.send("and the gates?")
		await harness.settled()

		expect(asked).toBe(1)
	})

	it("leaves the conversation without a name when the runtime returns none", async () => {
		const harness = await namelessWith(() => Promise.resolve(null))

		await harness.controller.send("how do we hold the walls?")
		await harness.settled()

		expect(harness.named).toEqual([])
	})

	it("leaves alone the name of a conversation that has one", async () => {
		const harness = await createHarness(["Ada"], {
			titleFor: () => Promise.resolve("Holding the walls"),
		})

		await harness.controller.send("how do we hold the walls?")
		await harness.settled()

		expect(harness.named).toEqual([])
	})
})
