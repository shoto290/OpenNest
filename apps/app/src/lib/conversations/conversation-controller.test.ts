import { beforeEach, describe, expect, it, vi } from "vitest"

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
import { message, seatBots } from "./transcript-fixtures"

import type { ActivityStatus, AgentEvent } from "../agent/contract"
import type { ChatDriver } from "../chat/driver"

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

const settled = async () => {
	for (let round = 0; round < 20; round += 1) {
		await Promise.resolve()
	}
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
		boundedContext: (
			conversationId,
			botId,
			runtimeSessionId,
			promptMessageId,
		) => {
			contexts.push([botId, promptMessageId])
			return base.boundedContext(
				conversationId,
				botId,
				runtimeSessionId,
				promptMessageId,
			)
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

const runningIn = (controller: ConversationController) =>
	controller.getState().speakers.map(({ botId }) => botId)

const unpublishedIn = (controller: ConversationController) =>
	controller
		.getState()
		.speakers.filter(({ hasPublished }) => !hasPublished)
		.map(({ botId }) => botId)

const workIn = (controller: ConversationController) =>
	controller.getState().speakers[0]?.work ?? null

const submittedIn = (harness: Harness) =>
	harness.driver.submissions.map(({ scope }) => scope.botId)

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

	it("runs every bot named at the same time, ranked by first mention", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Iris and @Nyx, both of you")
		await harness.settled()

		expect(submittedIn(harness)).toEqual([iris, nyx])
		expect(runningIn(harness.controller)).toEqual([iris, nyx])
		expect(harness.controller.getState().waitingBotIds).toEqual([])
	})

	it("keeps the rank of a bot whatever the order its wave mates answer in", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		harness.driver.pushTo(iris, [
			{
				type: "messageStarted",
				message: {
					id: "msg-iris",
					role: "assistant",
					text: "",
					completion: "streaming",
					timestamp: 1,
				},
			},
			{ type: "messageDelta", id: "msg-iris", seq: 1, text: "gates first" },
		])
		await harness.settled()

		expect(runningIn(harness.controller)).toEqual([nyx, iris])
	})

	it("reads the bounded context of every bot of the wave at the message sent", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		const said = harness.controller.getState().messages[0].id
		expect(harness.contexts).toEqual([
			[nyx, said],
			[iris, said],
		])
	})

	it("holds the bot a speaker names until its whole wave has stopped", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		harness.driver.pushTo(nyx, spoke(nyx, `over to <@${ada}>`))
		await harness.settled()

		expect(submittedIn(harness)).toEqual([nyx, iris])
		expect(harness.controller.getState().waitingBotIds).toEqual([ada])

		harness.driver.pushTo(iris, spoke(iris, "gates up"))
		await harness.settled()

		expect(submittedIn(harness)).toEqual([nyx, iris, ada])
	})

	it("runs in a second wave the bot a wave mate named", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		const completed = vi.spyOn(harness.store, "completeTurn")
		await harness.controller.send("@Ada then @Nyx")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, `over to <@${nyx}>`))
		await harness.settled()

		expect(submittedIn(harness)).toEqual([ada, nyx])
		expect(harness.controller.getState().waitingBotIds).toEqual([nyx])

		harness.driver.pushTo(nyx, spoke(nyx, "walls up"))
		await harness.settled()

		expect(submittedIn(harness)).toEqual([ada, nyx, nyx])
		expect(runningIn(harness.controller)).toEqual([nyx])
		expect(completed).not.toHaveBeenCalled()

		harness.driver.pushTo(nyx, spoke(nyx, "and the gates too"))
		await harness.settled()

		expect(runningIn(harness.controller)).toEqual([])
		expect(completed).toHaveBeenCalledTimes(1)
	})

	it("keeps the named order of the bots yet to publish while a wave mate publishes", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Ada then @Nyx then @Iris")
		await harness.settled()

		harness.driver.pushTo(nyx, [
			{
				type: "messageStarted",
				message: {
					id: "msg-nyx",
					role: "assistant",
					text: "",
					completion: "streaming",
					timestamp: 1,
				},
			},
			{
				type: "messageDelta",
				id: "msg-nyx",
				seq: 1,
				text: "walls first\n\n",
			},
		])
		await harness.settled()

		expect(runningIn(harness.controller)).toEqual([ada, nyx, iris])
		expect(unpublishedIn(harness.controller)).toEqual([ada, iris])
	})

	it("holds one summons only for a bot two speakers of a wave name", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		harness.driver.pushTo(nyx, spoke(nyx, `over to <@${ada}>`))
		harness.driver.pushTo(iris, spoke(iris, `and <@${ada}> too`))
		await harness.settled()

		expect(submittedIn(harness)).toEqual([nyx, iris, ada])
		expect(runningIn(harness.controller)).toEqual([ada])
	})

	it("drops an event carrying the scope of no running bot", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		await harness.controller.send("@Nyx take the walls")
		await harness.settled()
		harness.driver.pushTo(nyx, spoke(nyx, "walls up"))
		await harness.settled()

		harness.driver.pushTo(nyx, spoke(nyx, "and the gates"))
		await harness.settled()

		expect(spokenIn(harness.controller)).toEqual([
			[null, `<@${nyx}> take the walls`],
			[nyx, "walls up"],
		])
	})

	it("completes the turn once when the last bot of the wave stops", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		const completed = vi.spyOn(harness.store, "completeTurn")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		harness.driver.pushTo(nyx, spoke(nyx, "walls up"))
		await harness.settled()
		expect(completed).not.toHaveBeenCalled()

		harness.driver.pushTo(iris, spoke(iris, "gates up"))
		await harness.settled()

		expect(completed).toHaveBeenCalledTimes(1)
	})

	it("leaves no message of a bot that ended its turn writing nothing", async () => {
		const ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, SAID_NOTHING)
		await harness.settled()

		expect(spokenIn(harness.controller)).toEqual([[null, "and now?"]])
		expect(runningIn(harness.controller)).toEqual([])
	})

	it("names the run it left behind when the same bot speaks again", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const opened = vi.spyOn(harness.store, "openRuntimeSession")
		await harness.controller.send("and now?")
		await harness.settled()
		const first = harness.driver.submissions.at(-1)?.scope

		harness.driver.pushTo(ada, spoke(ada, "walls up"))
		await harness.settled()
		await harness.controller.send("and then?")
		await harness.settled()

		expect(opened.mock.calls.map((call) => call[3])).toEqual([
			null,
			first?.runtimeSessionId,
		])
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

	it("drops the bots of the open wave when a message comes in", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		const ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		await harness.controller.send("@Ada instead")
		await harness.settled()

		expect(runningIn(harness.controller)).toEqual([nyx, iris])
		expect(harness.controller.getState().waitingBotIds).toEqual([ada])

		harness.driver.pushTo(nyx, spoke(nyx, `over to <@${iris}>`))
		harness.driver.pushTo(iris, spoke(iris, "gates up"))
		await harness.settled()

		expect(submittedIn(harness)).toEqual([nyx, iris, ada])
		expect(runningIn(harness.controller)).toEqual([ada])
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
		const iris = idOf(harness.conversation, "Iris")
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

		expect(harness.driver.cancelled).toEqual([nyx, iris])
		expect(spokenIn(harness.controller)).toContainEqual([nyx, "half a wall"])
		expect(harness.controller.getState().waitingBotIds).toEqual([])
	})

	it("cancels the bot alone whose row the reader stopped", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		const stopped = harness.controller
			.getState()
			.speakers.find(({ botId }) => botId === iris)
		await stopped?.stop()
		harness.driver.pushTo(iris, [
			{ type: "turnEnded", ended: { sessionId: null, outcome: "cancelled" } },
		])
		await harness.settled()

		expect(harness.driver.cancelled).toEqual([iris])
		expect(runningIn(harness.controller)).toEqual([nyx])
	})

	it("cancels every bot and drops the summons held when the reader stops the conversation", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()
		harness.driver.pushTo(nyx, spoke(nyx, `over to <@${ada}>`))
		await harness.settled()

		await harness.controller.stop()
		harness.driver.pushTo(iris, [
			{ type: "turnEnded", ended: { sessionId: null, outcome: "cancelled" } },
		])
		await harness.settled()

		expect(harness.driver.cancelled).toEqual([iris])
		expect(harness.controller.getState().waitingBotIds).toEqual([])
		expect(submittedIn(harness)).toEqual([nyx, iris])
	})

	describe("stopping a summons held for the next wave", () => {
		const withOneHeld = async () => {
			const ada = idOf(harness.conversation, "Ada")
			const nyx = idOf(harness.conversation, "Nyx")
			await harness.controller.send("@Nyx then @Iris")
			await harness.settled()

			harness.driver.pushTo(nyx, spoke(nyx, `over to <@${ada}>`))
			await harness.settled()
			return { ada, nyx, iris: idOf(harness.conversation, "Iris") }
		}

		it("drops the summons the reader stopped before it speaks", async () => {
			const { ada, nyx, iris } = await withOneHeld()
			expect(harness.controller.getState().waitingBotIds).toEqual([ada])

			harness.controller.stopWaiting(ada)

			expect(harness.controller.getState().waitingBotIds).toEqual([])

			harness.driver.pushTo(iris, spoke(iris, "gates up"))
			await harness.settled()

			expect(submittedIn(harness)).toEqual([nyx, iris])
		})

		it("leaves the state alone when the bot is held nowhere", async () => {
			const { ada, nyx } = await withOneHeld()
			const before = harness.controller.getState()

			harness.controller.stopWaiting(nyx)

			expect(harness.controller.getState()).toBe(before)
			expect(before.waitingBotIds).toEqual([ada])
		})

		it("leaves a bot of the open wave in its seat, running", async () => {
			const { ada, iris } = await withOneHeld()

			harness.controller.stopWaiting(iris)
			await harness.settled()

			expect(runningIn(harness.controller)).toEqual([iris])
			expect(harness.driver.cancelled).toEqual([])
			expect(harness.controller.getState().waitingBotIds).toEqual([ada])
		})

		it("completes the open turn once the wave ends with nothing left held", async () => {
			const completed = vi.spyOn(harness.store, "completeTurn")
			const { ada, iris } = await withOneHeld()

			harness.controller.stopWaiting(ada)
			expect(completed).not.toHaveBeenCalled()

			harness.driver.pushTo(iris, spoke(iris, "gates up"))
			await harness.settled()

			expect(completed).toHaveBeenCalledTimes(1)
		})
	})

	it("shuts down the runtime of every bot of the open wave", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		await harness.controller.shutdown()

		expect(harness.driver.shutdowns).toEqual([nyx, iris])
	})

	describe("releasing the scope a speaker held", () => {
		const spokenOnce = async (harness: Harness, text: string) => {
			const nyx = idOf(harness.conversation, "Nyx")
			await harness.controller.send("@Nyx take the walls")
			await harness.settled()
			harness.driver.pushTo(nyx, spoke(nyx, text))
			await harness.settled()
			return nyx
		}

		it("shuts the scope of a bot down once its turn ends", async () => {
			const nyx = await spokenOnce(harness, "walls are held")

			expect(harness.driver.shutdowns).toEqual([nyx])
		})

		it("settles the reply of a bot whose shutdown never answers", async () => {
			vi.spyOn(harness.driver, "shutdown").mockReturnValue(
				new Promise(() => undefined),
			)

			const nyx = await spokenOnce(harness, "walls are held")

			expect(spokenIn(harness.controller)).toContainEqual([
				nyx,
				"walls are held",
			])
			expect(harness.controller.getState().messages.at(-1)?.completion).toBe(
				"complete",
			)
		})

		it("leaves the bot removed and its turn completed when the shutdown fails", async () => {
			const completed = vi.spyOn(harness.store, "completeTurn")
			vi.spyOn(harness.driver, "shutdown").mockRejectedValue({
				kind: "spawnFailed",
				detail: "gone",
			})

			await spokenOnce(harness, "walls are held")

			expect(runningIn(harness.controller)).toEqual([])
			expect(completed).toHaveBeenCalledTimes(1)
			expect(harness.controller.getState().latestError?.error).toEqual({
				kind: "spawnFailed",
				detail: "gone",
			})
		})

		it("resumes the next turn of a bot from the session its closed scope stored", async () => {
			const opened = vi.spyOn(harness.store, "openRuntimeSession")
			const nyx = await spokenOnce(harness, "walls are held")
			const first = harness.driver.submissions[0].scope.runtimeSessionId

			await harness.controller.send("@Nyx and the gates?")
			await harness.settled()

			expect(opened).toHaveBeenLastCalledWith(
				harness.conversation.id,
				nyx,
				expect.anything(),
				first,
				null,
			)
		})

		it("holds one open scope at most per bot over ten turns", async () => {
			const openRuntimeSession = harness.store.openRuntimeSession
			let live = 0
			let peak = 0
			vi.spyOn(harness.store, "openRuntimeSession").mockImplementation(
				async (...args) => {
					const session = await openRuntimeSession(...args)
					live += 1
					peak = Math.max(peak, live)
					return session
				},
			)
			vi.spyOn(harness.driver, "shutdown").mockImplementation(() => {
				live -= 1
				return Promise.resolve()
			})

			for (let turn = 0; turn < 10; turn += 1) {
				await spokenOnce(harness, "wall".repeat(turn + 1))
			}

			expect(peak).toBe(1)
			expect(live).toBe(0)
		})

		const refusedOn = async (refused: Partial<TranscriptStore>) => {
			const driver = createScriptedDriver()
			const controller = createConversationController(driver, {
				...harness.store,
				...refused,
			})
			const detach = controller.attach()
			await controller.open(harness.conversation)
			await controller.send("hold the walls")
			await settled()
			detach()
			return { driver, controller }
		}

		it("shuts nothing down for a bot that opened no scope", async () => {
			const { driver, controller } = await refusedOn({
				openRuntimeSession: () => Promise.reject(new Error("refused")),
			})

			expect(driver.shutdowns).toEqual([])
			expect(runningIn(controller)).toEqual([])
		})

		it("shuts the scope down of a bot whose prompt was refused", async () => {
			const { driver } = await refusedOn({
				boundedContext: () => Promise.reject(new Error("refused")),
			})

			expect(driver.shutdowns).toEqual([idOf(harness.conversation, "Ada")])
		})
	})

	describe("a bot asking the reader", () => {
		const askedIn = async (harness: Harness) => {
			const nyx = idOf(harness.conversation, "Nyx")
			await harness.controller.send("@Nyx hold the walls")
			await harness.settled()
			harness.driver.pushTo(nyx, [
				{
					type: "questionRequested",
					request: {
						id: "ask-1",
						questions: [
							{
								header: "Walls",
								question: "Which wall?",
								options: [],
								multiSelect: false,
							},
						],
					},
				},
			])
			await harness.settled()
			return nyx
		}

		const permittedIn = async (harness: Harness) => {
			const nyx = idOf(harness.conversation, "Nyx")
			await harness.controller.send("@Nyx hold the walls")
			await harness.settled()
			harness.driver.pushTo(nyx, [
				{
					type: "permissionRequested",
					request: {
						id: "let-1",
						toolName: "Bash",
						title: "Run the mason",
						detail: "mason --build",
					},
				},
			])
			await harness.settled()
			return nyx
		}

		it("holds a question with the bot that asked it", async () => {
			const nyx = await askedIn(harness)

			expect(harness.controller.getState().pendingPrompt).toEqual({
				kind: "question",
				botId: nyx,
				request: {
					id: "ask-1",
					questions: [
						{
							header: "Walls",
							question: "Which wall?",
							options: [],
							multiSelect: false,
						},
					],
				},
			})
		})

		it("holds a permission with the bot that asked it", async () => {
			const nyx = await permittedIn(harness)

			expect(harness.controller.getState().pendingPrompt).toMatchObject({
				kind: "permission",
				botId: nyx,
				request: { id: "let-1" },
			})
		})

		it("draws the bot that asked as waiting on its first question", async () => {
			await askedIn(harness)

			expect(workIn(harness.controller)).toEqual({
				kind: "waiting",
				label: "Walls",
			})
		})

		it("draws the bot that asked as waiting on the permission it wants", async () => {
			await permittedIn(harness)

			expect(workIn(harness.controller)).toEqual({
				kind: "waiting",
				label: "Run the mason",
			})
		})

		it("gives the bot back the work it was doing once the ask is answered", async () => {
			await askedIn(harness)

			await harness.controller.answer("ask-1", { "Which wall?": "the north" })
			await harness.settled()

			expect(workIn(harness.controller)).toEqual({
				kind: "thinking",
			})
		})

		it("answers on the runtime of the bot that asked, then releases the ask", async () => {
			const nyx = await askedIn(harness)

			await harness.controller.answer("ask-1", { "Which wall?": "the north" })
			await harness.settled()

			expect(harness.driver.answered).toEqual([
				{
					botId: nyx,
					id: "ask-1",
					answers: { "Which wall?": "the north" },
				},
			])
			expect(harness.controller.getState().pendingPrompt).toBeNull()
		})

		it("writes the question into the transcript as a message of the bot", async () => {
			const nyx = await askedIn(harness)

			const asking = harness.controller
				.getState()
				.messages.find((message) => message.id === "question-ask-1")
			expect(asking).toMatchObject({
				authorBotId: nyx,
				role: "assistant",
				content: "### Which wall?",
			})
		})

		it("writes the answers into the transcript as a message of the reader", async () => {
			await askedIn(harness)

			await harness.controller.answer("ask-1", { "Which wall?": "the north" })
			await harness.settled()

			expect(spokenIn(harness.controller)).toContainEqual([null, "the north"])
		})

		it("points the answer at the question it replies to", async () => {
			await askedIn(harness)

			await harness.controller.answer("ask-1", { "Which wall?": "the north" })
			await harness.settled()

			const answering = harness.controller.getState().messages.at(-1)
			expect(answering?.repliedToMessageId).toBe("question-ask-1")

			const page = await harness.store.loadPage(harness.conversation.id, null)
			expect(
				page.messages.find((message) => message.id === answering?.id)
					?.repliedToMessageId,
			).toBe("question-ask-1")
		})

		it("decides on the runtime of the bot that asked, then releases the ask", async () => {
			const nyx = await permittedIn(harness)

			await harness.controller.respond("let-1", "allowOnce")
			await harness.settled()

			expect(harness.driver.decided).toEqual([
				{ botId: nyx, id: "let-1", decision: "allowOnce" },
			])
			expect(harness.controller.getState().pendingPrompt).toBeNull()
		})

		it("releases the ask when the turn of the bot ends", async () => {
			const nyx = await askedIn(harness)

			harness.driver.pushTo(nyx, [
				{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
			])
			await harness.settled()

			expect(harness.controller.getState().pendingPrompt).toBeNull()
		})

		it("denies the ask before cancelling the turn it is held in", async () => {
			const nyx = await askedIn(harness)

			await harness.controller.stop()
			await harness.settled()

			expect(harness.driver.decided).toEqual([
				{ botId: nyx, id: "ask-1", decision: "deny" },
			])
			expect(harness.controller.getState().pendingPrompt).toBeNull()
			expect(harness.driver.cancelled).toEqual([nyx])
		})
	})

	describe("two bots of a wave asking the reader", () => {
		const askedBoth = async (harness: Harness) => {
			const nyx = idOf(harness.conversation, "Nyx")
			const iris = idOf(harness.conversation, "Iris")
			await harness.controller.send("@Nyx then @Iris")
			await harness.settled()
			harness.driver.pushTo(nyx, [
				{
					type: "questionRequested",
					request: {
						id: "ask-1",
						questions: [
							{
								header: "Walls",
								question: "Which wall?",
								options: [],
								multiSelect: false,
							},
						],
					},
				},
			])
			harness.driver.pushTo(iris, [
				{
					type: "permissionRequested",
					request: {
						id: "let-1",
						toolName: "Bash",
						title: "Run the mason",
						detail: "mason --build",
					},
				},
			])
			await harness.settled()
			return { nyx, iris }
		}

		it("exposes the oldest ask alone", async () => {
			await askedBoth(harness)

			expect(harness.controller.getState().pendingPrompt).toMatchObject({
				kind: "question",
				request: { id: "ask-1" },
			})
		})

		it("gives each bot of the wave the work it is doing", async () => {
			await askedBoth(harness)

			expect(
				harness.controller.getState().speakers.map(({ work }) => work),
			).toEqual([
				{ kind: "waiting", label: "Walls" },
				{ kind: "waiting", label: "Run the mason" },
			])
		})

		it("exposes the next ask once the oldest is released", async () => {
			const { nyx } = await askedBoth(harness)

			await harness.controller.answer("ask-1", { "Which wall?": "the north" })
			await harness.settled()

			expect(harness.driver.answered).toEqual([
				{
					botId: nyx,
					id: "ask-1",
					answers: { "Which wall?": "the north" },
				},
			])
			expect(harness.controller.getState().pendingPrompt).toMatchObject({
				kind: "permission",
				request: { id: "let-1" },
			})
		})

		it("decides on the runtime of the bot holding the permission", async () => {
			const { iris } = await askedBoth(harness)

			await harness.controller.respond("let-1", "allowOnce")
			await harness.settled()

			expect(harness.driver.decided).toEqual([
				{ botId: iris, id: "let-1", decision: "allowOnce" },
			])
		})
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

describe("what a speaking bot is doing", () => {
	const ran = (
		id: string,
		title: string,
		status: ActivityStatus,
	): AgentEvent => ({
		type: "activity",
		activity: { id, title, kind: "tool", status },
	})

	let harness: Harness
	let ada: string

	beforeEach(async () => {
		harness = await createHarness(["Ada"])
		ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("and now?")
		await harness.settled()
	})

	it("says a bot that has neither run a tool nor written is thinking", () => {
		expect(workIn(harness.controller)).toEqual({
			kind: "thinking",
		})
	})

	it("names the work of the tool a bot runs", async () => {
		harness.driver.pushTo(ada, [ran("a-1", "Grep · walls", "running")])
		await harness.settled()

		expect(workIn(harness.controller)).toEqual({
			kind: "searching",
			label: "Grep · walls",
		})
	})

	const started: AgentEvent[] = [
		ran("a-1", "Grep · walls", "running"),
		ran("a-1", "Grep · walls", "succeeded"),
		{
			type: "messageStarted",
			message: {
				id: "msg-ada",
				role: "assistant",
				text: "",
				completion: "streaming",
				timestamp: 1,
			},
		},
	]

	it("keeps a bot thinking between its first token and its first block", async () => {
		harness.driver.pushTo(ada, [
			...started,
			{ type: "messageDelta", id: "msg-ada", seq: 1, text: "walls up" },
		])
		await harness.settled()

		expect(unpublishedIn(harness.controller)).toEqual([ada])
		expect(workIn(harness.controller)).toEqual({
			kind: "thinking",
		})
	})

	it("says a bot is writing once it has published a block", async () => {
		harness.driver.pushTo(ada, [
			...started,
			{ type: "messageDelta", id: "msg-ada", seq: 1, text: "walls up\n\n" },
		])
		await harness.settled()

		expect(unpublishedIn(harness.controller)).toEqual([])
		expect(workIn(harness.controller)).toEqual({
			kind: "writing",
		})
	})

	it("drops what a bot was doing when it stops answering", async () => {
		harness.driver.pushTo(ada, [
			ran("a-1", "Grep · walls", "running"),
			...spoke(ada, "walls up"),
		])
		await harness.settled()

		expect(workIn(harness.controller)).toBeNull()
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

describe("failures the conversation carries to the screen", () => {
	const olderPageStore = (refusals: number): TranscriptStore => {
		const base = createFakeTranscriptStore()
		let refused = 0
		return {
			...base,
			loadPage: (conversationId, cursor) => {
				if (!cursor) {
					return Promise.resolve({
						conversationId,
						messages: [message({ id: "m-2", conversationId, seq: 2 })],
						hasMore: true,
					})
				}
				if (refused < refusals) {
					refused += 1
					return Promise.reject(new Error("refused"))
				}
				return Promise.resolve({
					conversationId,
					messages: [message({ id: "m-1", conversationId, seq: 1 })],
					hasMore: false,
				})
			},
		}
	}

	const openedOn = async (store: TranscriptStore) => {
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: [],
		})
		const controller = createConversationController(
			createScriptedDriver(),
			store,
		)
		const detach = controller.attach()
		await controller.open(conversation)
		return { controller, detach }
	}

	it("holds the failure and keeps the older page in reach when the store refuses it", async () => {
		const { controller, detach } = await openedOn(olderPageStore(1))

		await controller.loadOlder()

		const state = controller.getState()
		expect(state.latestError?.error.kind).toBe("readFailed")
		expect(state.hasOlder).toBe(true)
		expect(state.isLoadingOlder).toBe(false)
		detach()
	})

	it("forgets the failure once the older page comes through", async () => {
		const { controller, detach } = await openedOn(olderPageStore(1))

		await controller.loadOlder()
		await controller.loadOlder()

		expect(controller.getState().latestError).toBeNull()
		detach()
	})

	it("forgets the failure the reader dismissed", async () => {
		const { controller, detach } = await openedOn(olderPageStore(1))

		await controller.loadOlder()
		const held = controller.getState().latestError

		controller.dismissError(held?.id ?? "")

		expect(controller.getState().latestError).toBeNull()
		detach()
	})

	const seatedOn = async (driver: ChatDriver) => {
		const store = createFakeTranscriptStore()
		const bots = await seatBots(store, SPACE, ["Ada"])
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: bots.map((bot) => bot.id),
		})
		const controller = createConversationController(driver, store)
		const detach = controller.attach()
		await controller.open(conversation)
		return { controller, detach }
	}

	const refusingSessions = (refusals: number): ChatDriver => {
		const scripted = createScriptedDriver()
		let refused = 0
		return {
			...scripted,
			startOrResumeSession: (scope) => {
				if (refused < refusals) {
					refused += 1
					return Promise.reject({ kind: "spawnFailed", detail: "no binary" })
				}
				return scripted.startOrResumeSession(scope)
			},
		}
	}

	it("holds the transport failure that kept a bot from taking the turn", async () => {
		const { controller, detach } = await seatedOn(refusingSessions(1))

		await controller.send("how do we hold the walls?")
		await settled()

		expect(controller.getState().latestError?.error).toEqual({
			kind: "spawnFailed",
			detail: "no binary",
		})
		detach()
	})

	it("forgets the failure once a bot takes the turn", async () => {
		const { controller, detach } = await seatedOn(refusingSessions(1))

		await controller.send("how do we hold the walls?")
		await settled()
		await controller.send("and the gates?")
		await settled()

		expect(controller.getState().latestError).toBeNull()
		detach()
	})
})
