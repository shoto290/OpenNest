import { describe, expect, it } from "vitest"

import { createFakeOnboardingPort } from "./fake-onboarding-port"
import {
	createFakeOnboardingWorld,
	type FakeOnboardingWorld,
} from "./fake-onboarding-world"
import {
	createOnboardingController,
	type OnboardingController,
} from "./onboarding-controller"
import {
	onboardingSummonsFor,
	withoutOnboardingSummons,
} from "./onboarding-summons"
import { type OnboardingTail, onboardingTailOf } from "./onboarding-tail"
import type { Onboarding } from "./use-onboarding"

import { type ChatState, initialChatState } from "../chat/chat-state"
import type { TranscriptRow } from "../chat/screen-model"
import { message } from "../conversations/transcript-fixtures"

const GREETING = onboardingSummonsFor("greeting")

const SUMMONS_TURN = "t-summons"

const HOME_BOT = "bot-home"

const OTHER_BOT = "bot-other"

let world: FakeOnboardingWorld

const IGNORED_FAILURE = () => undefined

const controllerOf = (): OnboardingController => {
	world = createFakeOnboardingWorld()
	return createOnboardingController(createFakeOnboardingPort(), world, {
		reportFailure: IGNORED_FAILURE,
	})
}

const settled = async (): Promise<OnboardingController> => {
	const port = createFakeOnboardingPort()
	port.report = {
		connection: "ready",
		binaryVersion: null,
		authenticated: true,
		error: null,
		account: { email: null, plan: null },
	}
	world = createFakeOnboardingWorld()
	const controller = createOnboardingController(port, world, {
		reportFailure: IGNORED_FAILURE,
	})
	await controller.start()

	return controller
}

const onboardingOf = (controller: OnboardingController): Onboarding => ({
	state: controller.getState(),
	controller,
})

const chatWith = (overrides: Partial<ChatState> = {}): ChatState => ({
	...initialChatState,
	...overrides,
})

const tailOf = (
	controller: OnboardingController,
	chat: ChatState = chatWith(),
) => onboardingTailOf(onboardingOf(controller), chat, HOME_BOT)

const askedOf = (tail: OnboardingTail | null) =>
	tail?.step?.request.questions[0]

const summonsAsked = message({
	id: "m-summons",
	turnId: SUMMONS_TURN,
	role: "user",
	content: GREETING,
})

const answered = message({
	id: "m-answer",
	turnId: SUMMONS_TURN,
	role: "assistant",
	authorBotId: "bot-1",
	content: "Hello.",
})

const failedTurn = chatWith({
	messages: [summonsAsked],
	turn: "failed",
	errors: [
		{
			id: "crashed-0",
			error: { kind: "crashed", code: 1, detail: "the agent stopped" },
		},
	],
})

describe("the onboarding tail", () => {
	it("stands down once the first run is done", async () => {
		const controller = controllerOf()
		await controller.finish()

		expect(tailOf(controller)).toBeNull()
	})

	it("stands down when no onboarding is running", () => {
		expect(onboardingTailOf(undefined, chatWith(), HOME_BOT)).toBeNull()
	})

	it("asks the welcome step before any step is taken", () => {
		expect(askedOf(tailOf(controllerOf()))?.question).toBe("Ready to start?")
	})

	it("asks nothing while the summoned turn is pending", async () => {
		const controller = await settled()
		const tail = tailOf(controller, chatWith({ messages: [summonsAsked] }))

		expect(tail?.step).toBeNull()
	})

	it("asks the first reply step once the answer landed", async () => {
		const controller = await settled()
		const tail = tailOf(
			controller,
			chatWith({ messages: [summonsAsked, answered] }),
		)

		expect(askedOf(tail)?.question).toBe(
			"That's it working. Ready for the last one?",
		)
		expect(askedOf(tail)?.failure).toBeUndefined()
	})

	it("names the failure detail when the turn failed", async () => {
		const controller = await settled()

		expect(askedOf(tailOf(controller, failedTurn))?.failure).toEqual({
			title: "Couldn't sign you in",
			detail: "the agent stopped",
		})
	})

	it("summons again when the reader retries the failed turn", async () => {
		const controller = await settled()
		const step = tailOf(controller, failedTurn)?.step

		await step?.onAnswers({
			[step.request.questions[0]?.question ?? ""]: "Try again",
		})

		expect(world.sent).toHaveLength(2)
	})

	it("asks nothing more once the reader handed the first companion to Shoto", async () => {
		const controller = await settled()
		const chat = chatWith({ messages: [summonsAsked, answered] })

		await controller.pickCompanion()

		expect(tailOf(controller, chat)).toBeNull()
	})

	it("stands down in a conversation the onboarding did not start in", async () => {
		const controller = await settled()

		expect(
			onboardingTailOf(onboardingOf(controller), chatWith(), OTHER_BOT),
		).toBeNull()
	})
})

const rowOf = (overrides: Partial<TranscriptRow>): TranscriptRow => ({
	messageId: "m-1",
	turnId: SUMMONS_TURN,
	blockIndex: 0,
	quotedMessageId: null,
	authorBotId: null,
	role: "user",
	text: "",
	timestamp: 0,
	completion: "complete",
	...overrides,
})

describe("the summons row", () => {
	it("drops the summons the reader never wrote", () => {
		const kept = withoutOnboardingSummons([
			rowOf({ text: GREETING }),
			rowOf({
				messageId: "m-2",
				role: "assistant",
				authorBotId: "bot-1",
				text: "Hello.",
			}),
		])

		expect(kept.map(({ text }) => text)).toEqual(["Hello."])
	})

	it("drops the summons that sent Shoto after the first companion", () => {
		const kept = withoutOnboardingSummons([
			rowOf({ text: onboardingSummonsFor("firstCompanion") }),
		])

		expect(kept).toHaveLength(0)
	})

	it("drops the summons that opened the created companion thread", () => {
		const kept = withoutOnboardingSummons([
			rowOf({ text: onboardingSummonsFor("arrival") }),
		])

		expect(kept).toHaveLength(0)
	})

	it("keeps a reader line that only looks like one", () => {
		const kept = withoutOnboardingSummons([rowOf({ text: "Say hello." })])

		expect(kept).toHaveLength(1)
	})
})
