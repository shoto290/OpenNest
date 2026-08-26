import { beforeEach, describe, expect, it } from "vitest"

import {
	type ConversationController,
	createConversationController,
} from "./conversation-controller"
import { createFakeTranscriptStore } from "./fake-transcript-store"
import type { Conversation } from "./store-contract"
import type { TranscriptStore } from "./store-port"
import { botIdentity } from "./transcript-fixtures"

import type { AgentEvent, RuntimeScope } from "../agent/contract"
import type { ChatDriver } from "../chat/driver"

const SPACE = "personal"

type Submission = {
	scope: RuntimeScope
	prompt: string
}

type ScriptedDriver = ChatDriver & {
	submissions: Submission[]
	pushTo: (botId: string, events: AgentEvent[]) => void
	cancelled: string[]
}

const createScriptedDriver = (): ScriptedDriver => {
	const listeners = new Set<
		(scoped: { scope: RuntimeScope; event: AgentEvent }) => void
	>()
	const submissions: Submission[] = []
	const cancelled: string[] = []

	const scopeOf = (botId: string) => {
		const last = submissions.findLast(
			(submission) => submission.scope.botId === botId,
		)
		if (!last) {
			throw new Error(`no run was opened for ${botId}`)
		}
		return last.scope
	}

	return {
		submissions,
		cancelled,
		pushTo: (botId, events) => {
			const scope = scopeOf(botId)
			for (const event of events) {
				for (const listener of listeners) {
					listener({ scope, event })
				}
			}
		},
		check: () =>
			Promise.resolve({
				connection: "ready",
				binaryVersion: "1",
				authenticated: true,
				error: null,
			}),
		startOrResumeSession: () => Promise.resolve({ resumed: false }),
		submitPrompt: (scope, prompt) => {
			submissions.push({ scope, prompt })
			return Promise.resolve()
		},
		storeAttachments: () => Promise.resolve([]),
		cancelTurn: (scope) => {
			cancelled.push(scope.botId)
			return Promise.resolve()
		},
		respondToPermission: () => Promise.resolve(),
		answerQuestion: () => Promise.resolve(),
		shutdown: () => Promise.resolve(),
		subscribe: (onEvent) => {
			listeners.add(onEvent)
			return Promise.resolve(() => listeners.delete(onEvent))
		},
	}
}

const spoke = (botId: string, text: string): AgentEvent[] => [
	{
		type: "messageStarted",
		message: {
			id: `msg-${botId}-${text.length}`,
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: 1,
		},
	},
	{
		type: "messageDelta",
		id: `msg-${botId}-${text.length}`,
		seq: 1,
		text,
	},
	{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
]

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
	detach: () => void
	settled: () => Promise<void>
}

const seatBots = async (store: TranscriptStore, names: string[]) => {
	const bots = []
	for (const name of names) {
		bots.push(await store.createBot(botIdentity({ name }), SPACE))
	}
	return bots
}

const createHarness = async (names: string[]): Promise<Harness> => {
	const driver = createScriptedDriver()
	const contexts: [string, string][] = []
	const base = createFakeTranscriptStore()
	const store: TranscriptStore = {
		...base,
		boundedContext: (conversationId, botId, promptMessageId) => {
			contexts.push([botId, promptMessageId])
			return base.boundedContext(conversationId, botId, promptMessageId)
		},
	}
	const bots = await seatBots(store, names)
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: bots.map((bot) => bot.id),
	})
	let minted = 0
	const controller = createConversationController(driver, store, {
		newId: () => {
			minted += 1
			return `id-${minted}`
		},
		now: () => minted,
	})
	const detach = controller.attach()
	await controller.open(conversation)
	const settled = async () => {
		for (let round = 0; round < 20; round += 1) {
			await Promise.resolve()
		}
	}
	await settled()
	return { driver, contexts, store, controller, conversation, detach, settled }
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
})
