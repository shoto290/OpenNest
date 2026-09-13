import { beforeEach, describe, expect, it, type Mock, vi } from "vitest"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"

import {
	createFakeOnboardingPort,
	type FakeOnboardingPort,
} from "./fake-onboarding-port"
import {
	createFakeOnboardingWorld,
	type FakeOnboardingWorld,
	SUGGESTED_SCOUT,
	SUGGESTED_WRITER,
} from "./fake-onboarding-world"
import {
	createOnboardingController,
	type OnboardingController,
} from "./onboarding-controller"
import { onboardingSummonsFor } from "./onboarding-summons"

import type { CheckReport, TransportError } from "../agent/contract"

const SIGN_IN_URL = "https://claude.ai/oauth/authorize?code=true"

const EMAIL = "reader@example.com"

const API_KEY = "sk-ant-secret"

const CODE = "code#state"

const authenticated = (account?: {
	email: string | null
	plan: string | null
}): CheckReport => ({
	connection: "ready",
	binaryVersion: null,
	authenticated: true,
	error: null,
	account,
})

const NOT_AUTHENTICATED: CheckReport = {
	connection: "ready",
	binaryVersion: null,
	authenticated: false,
	error: { kind: "notAuthenticated" },
}

const refusedRead = (error: TransportError): CheckReport => ({
	connection: "unavailable",
	binaryVersion: null,
	authenticated: false,
	error,
})

let port: FakeOnboardingPort
let world: FakeOnboardingWorld
let controller: OnboardingController
let reportFailure: Mock<(notice: NoticeMessage) => void>

const createController = () => {
	port = createFakeOnboardingPort()
	world = createFakeOnboardingWorld()
	reportFailure = vi.fn<(notice: NoticeMessage) => void>()

	return createOnboardingController(port, world, { reportFailure })
}

const commands = () => port.calls.map(({ command }) => command)

const flushed = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
	controller = createController()
})

describe("the welcome step", () => {
	it("opens on the welcome step", () => {
		expect(controller.getState().step).toBe("welcome")
		expect(controller.getState().connection).toBeNull()
	})

	it("reads the account when the reader starts", async () => {
		port.report = NOT_AUTHENTICATED

		await controller.start()

		expect(commands()).toEqual(["check"])
	})

	it("reads the account when the reader asks to hear more first", async () => {
		port.report = NOT_AUTHENTICATED

		await controller.tellMore()

		expect(commands()).toEqual(["check"])
	})
})

describe("reading the account", () => {
	it("names the email and the plan of the detected account", async () => {
		port.report = authenticated({ email: EMAIL, plan: "Max" })

		await controller.start()

		expect(controller.getState().connection).toEqual({
			state: "detected",
			account: `${EMAIL} · Max`,
		})
	})

	it("names the email alone when the report carries no plan", async () => {
		port.report = authenticated({ email: EMAIL, plan: null })

		await controller.start()

		expect(controller.getState().connection).toEqual({
			state: "detected",
			account: EMAIL,
		})
	})

	it("settles without a connection step when the report carries no email", async () => {
		port.report = authenticated({ email: null, plan: null })

		await controller.start()

		expect(controller.getState().step).toBe("summoned")
		expect(controller.getState().connection).toBeNull()
	})

	it("offers the sign-in when nobody is authenticated", async () => {
		port.report = NOT_AUTHENTICATED

		await controller.start()

		expect(controller.getState().connection).toEqual({ state: "offer" })
	})

	it("fails visibly when the report carries a reason of its own", async () => {
		port.report = refusedRead({ kind: "spawnFailed", detail: "no binary" })

		await controller.start()

		expect(controller.getState().connection).toEqual({
			state: "signInFailed",
			exitDetail: "no binary",
		})
	})

	it("says in words what a report with no detail carries", async () => {
		port.report = refusedRead({ kind: "binaryNotFound", searched: [] })

		await controller.start()

		expect(controller.getState().connection).toEqual({
			state: "signInFailed",
			exitDetail: "the agent binary was not found",
		})
	})
})

describe("the detected account", () => {
	beforeEach(async () => {
		port.report = authenticated({ email: EMAIL, plan: null })
		await controller.start()
	})

	it("settles on the account the reader keeps", async () => {
		await controller.acceptAccount()

		expect(controller.getState().step).toBe("summoned")
	})

	it("offers the sign-in when the reader wants another account", () => {
		controller.changeAccount()

		expect(controller.getState().connection).toEqual({ state: "offer" })
	})
})

describe("signing in", () => {
	beforeEach(async () => {
		port.report = NOT_AUTHENTICATED
		await controller.start()
	})

	it("opens the announced url and waits on it", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		port.announceStarted(SIGN_IN_URL)
		await Promise.resolve()

		expect(controller.getState().connection).toEqual({
			state: "waiting",
			signInUrl: SIGN_IN_URL,
		})
		expect(port.calls).toContainEqual({
			command: "openSignInUrl",
			value: SIGN_IN_URL,
		})

		port.completeSignIn()
		await signingIn
	})

	it("frees the code step once the browser step is on screen", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		expect(controller.getState().isBusy).toBe(true)

		port.announceStarted(SIGN_IN_URL)
		await Promise.resolve()
		expect(controller.getState().isBusy).toBe(false)

		port.completeSignIn()
		await signingIn
	})

	it("settles once the sign-in lands", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		port.completeSignIn()
		await signingIn

		expect(controller.getState().step).toBe("summoned")
	})

	it("shows the detail the rejection carries", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		port.refuseSignIn({ kind: "failed", detail: "auth login exited with 1" })
		await signingIn

		expect(controller.getState().connection).toEqual({
			state: "signInFailed",
			exitDetail: "auth login exited with 1",
		})
	})

	it("ends the running sign-in and starts a new one when the reader asks again", async () => {
		const first = controller.signIn()
		await flushed()

		const second = controller.signIn()
		await flushed()
		port.announceStarted(SIGN_IN_URL)
		await flushed()

		expect(commands()).toEqual([
			"check",
			"signIn",
			"cancelSignIn",
			"signIn",
			"openSignInUrl",
		])
		expect(controller.getState().connection).toEqual({
			state: "waiting",
			signInUrl: SIGN_IN_URL,
		})

		port.completeSignIn()
		await Promise.all([first, second])
		expect(controller.getState().step).toBe("summoned")
		expect(world.sent).toHaveLength(1)
	})

	it("says in words what a rejection with no detail carries", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		port.refuseSignIn({ kind: "timedOut" })
		await signingIn

		expect(controller.getState().connection).toEqual({
			state: "signInFailed",
			exitDetail: "the sign-in timed out",
		})
	})

	it("sends the code the reader submits", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		port.announceStarted(SIGN_IN_URL)
		await controller.submitCode(CODE)

		expect(port.calls).toContainEqual({ command: "enterCode", value: CODE })

		port.completeSignIn()
		await signingIn
	})

	it("leaves the step alone when the code lands on no running sign-in", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		port.announceStarted(SIGN_IN_URL)
		await Promise.resolve()
		port.refusals.enterCode = { kind: "notRunning" }

		await controller.submitCode(CODE)

		expect(controller.getState().connection).toEqual({
			state: "waiting",
			signInUrl: SIGN_IN_URL,
		})

		port.completeSignIn()
		await signingIn
	})

	it("asks for the key when the reader takes it instead", async () => {
		const signingIn = controller.signIn()
		await Promise.resolve()
		port.announceStarted(SIGN_IN_URL)
		await Promise.resolve()

		await controller.pasteKeyInstead()
		await signingIn

		expect(commands()).toContain("cancelSignIn")
		expect(controller.getState().connection).toEqual({ state: "apiKey" })
	})

	it("raises no notice when the cancel lands on no running sign-in", async () => {
		port.refusals.cancelSignIn = { kind: "notRunning" }

		await controller.pasteKeyInstead()

		expect(controller.getState().connection).toEqual({ state: "apiKey" })
	})
})

describe("the api key", () => {
	beforeEach(async () => {
		port.report = NOT_AUTHENTICATED
		await controller.start()
	})

	it("asks for the key when the reader picks it", () => {
		controller.askApiKey()

		expect(controller.getState().connection).toEqual({ state: "apiKey" })
	})

	it("counts a new round for every step it shows", () => {
		const offered = controller.getState().round

		controller.askApiKey()

		expect(controller.getState().round).toBe(offered + 1)
	})

	it("ends the running sign-in before holding the key", async () => {
		port.refusals.cancelSignIn = { kind: "notRunning" }
		port.report = authenticated({ email: null, plan: null })
		controller.askApiKey()
		const signingIn = controller.signIn()
		await flushed()

		await controller.submitApiKey(API_KEY)
		port.announceStarted(SIGN_IN_URL)
		port.completeSignIn()
		await signingIn

		expect(commands().indexOf("cancelSignIn")).toBeGreaterThan(-1)
		expect(commands().indexOf("cancelSignIn")).toBeLessThan(
			commands().indexOf("holdApiKey"),
		)
		expect(world.sent).toHaveLength(1)
		expect(controller.getState().connection).toBeNull()
	})

	it("holds the key and reads the account again", async () => {
		port.report = authenticated({ email: EMAIL, plan: null })

		await controller.submitApiKey(API_KEY)

		expect(port.calls).toContainEqual({
			command: "holdApiKey",
			value: API_KEY,
		})
		expect(commands().at(-1)).toBe("check")
		expect(controller.getState().connection).toEqual({
			state: "detected",
			account: EMAIL,
		})
	})

	it("fails visibly when the key is refused", async () => {
		port.refusals.holdApiKey = { kind: "unwritable", detail: "read only" }

		await controller.submitApiKey(API_KEY)

		expect(controller.getState().connection).toEqual({
			state: "apiKeyFailed",
			exitDetail: "read only",
		})
	})
})

describe("the summons", () => {
	it("asks for a greeting when the reader started", async () => {
		port.report = authenticated({ email: null, plan: null })

		await controller.start()

		expect(world.sent).toEqual([onboardingSummonsFor("greeting")])
	})

	it("asks what the companion is for when the reader wanted to hear more", async () => {
		port.report = authenticated({ email: null, plan: null })

		await controller.tellMore()

		expect(world.sent).toEqual([onboardingSummonsFor("purpose")])
	})

	it("summons again when the reader retries the failed turn", async () => {
		port.report = authenticated({ email: null, plan: null })
		await controller.start()

		await controller.summonAgain()

		expect(world.sent).toHaveLength(2)
	})
})

describe("the end of the first run", () => {
	it("marks the first run done and leaves no connection step", async () => {
		port.report = authenticated({ email: null, plan: null })
		await controller.start()

		await controller.finish()

		expect(controller.getState().step).toBe("done")
		expect(controller.getState().connection).toBeNull()
		expect(world.firstRunDone).toBe(1)
	})
})

describe("the first companion", () => {
	beforeEach(async () => {
		port.report = authenticated({ email: null, plan: null })
		await controller.start()
	})

	it("shows one option per suggestion when the reader picks", async () => {
		await controller.pickCompanion()

		expect(controller.getState().step).toBe("picking")
		expect(controller.getState().suggestions).toEqual([
			SUGGESTED_WRITER,
			SUGGESTED_SCOUT,
		])
	})

	it("reports the reason and stays on the test step when the suggestions refuse to load", async () => {
		world.refusals.suggest = { kind: "storage", detail: "disk is full" }

		await controller.pickCompanion()

		expect(reportFailure).toHaveBeenCalledWith({
			title: "Couldn't load the suggested companions",
			description: "disk is full",
		})
		expect(controller.getState().step).toBe("summoned")
		expect(world.firstRunDone).toBe(0)
	})

	it("reports the reason and stays on the test step when nothing is suggested", async () => {
		world.suggestions.length = 0

		await controller.pickCompanion()

		expect(reportFailure).toHaveBeenCalledWith({
			title: "Couldn't load the suggested companions",
			description: "the agent suggested no companion",
		})
		expect(controller.getState().step).toBe("summoned")
	})

	it("opens the picker on a second press once a suggestion lands", async () => {
		world.suggestions.length = 0
		await controller.pickCompanion()
		world.suggestions.push(SUGGESTED_WRITER)

		await controller.pickCompanion()

		expect(controller.getState().step).toBe("picking")
		expect(controller.getState().suggestions).toEqual([SUGGESTED_WRITER])
	})

	it("creates the companion from the name, the job and the description", async () => {
		await controller.pickCompanion()

		await controller.addCompanion(SUGGESTED_SCOUT.id)

		expect(world.drafted).toEqual([
			{
				name: SUGGESTED_SCOUT.name,
				job: SUGGESTED_SCOUT.job,
				description: SUGGESTED_SCOUT.description,
			},
		])
	})

	it("hands off to the created companion", async () => {
		await controller.pickCompanion()

		await controller.addCompanion(SUGGESTED_SCOUT.id)

		expect(controller.getState().step).toBe("handoff")
		expect(controller.getState().handoff).toEqual({
			botId: "bot-scout",
			name: SUGGESTED_SCOUT.name,
			description: SUGGESTED_SCOUT.blurb,
			animal: "owl",
			blot: "cyan",
		})
	})

	it("starts the created companion first turn in its own conversation", async () => {
		await controller.pickCompanion()

		await controller.addCompanion(SUGGESTED_SCOUT.id)

		expect(world.greetings).toEqual([
			{ botId: "bot-scout", text: onboardingSummonsFor("arrival") },
		])
		expect(world.sent).toHaveLength(1)
	})

	it("keeps the picker reachable and reports the reason when the creation is refused", async () => {
		await controller.pickCompanion()
		world.refusals.create = { kind: "namelessBot", detail: "no name" }

		await controller.addCompanion(SUGGESTED_SCOUT.id)

		expect(reportFailure).toHaveBeenCalledWith({
			title: `Couldn't add ${SUGGESTED_SCOUT.name}`,
			description: "no name",
		})
		expect(controller.getState().step).toBe("picking")
		expect(controller.getState().suggestions).toHaveLength(2)
		expect(world.firstRunDone).toBe(0)
	})

	it("hands off anyway and reports the reason when the first turn fails to start", async () => {
		await controller.pickCompanion()
		world.refusals.greet = { kind: "crashed", detail: "the agent stopped" }

		await controller.addCompanion(SUGGESTED_SCOUT.id)

		expect(reportFailure).toHaveBeenCalledWith({
			title: `${SUGGESTED_SCOUT.name} couldn't say hello`,
			description: "the agent stopped",
		})
		expect(controller.getState().step).toBe("handoff")
		expect(controller.getState().handoff?.name).toBe(SUGGESTED_SCOUT.name)
	})

	it("writes one companion per press of add", async () => {
		await controller.pickCompanion()

		await Promise.all([
			controller.addCompanion(SUGGESTED_SCOUT.id),
			controller.addCompanion(SUGGESTED_SCOUT.id),
		])

		expect(world.drafted).toHaveLength(1)
	})

	it("holds the picker busy while the creation is in flight", async () => {
		await controller.pickCompanion()
		let created: (() => void) | undefined
		world.create = async (draft) => {
			await new Promise<void>((resolve) => {
				created = resolve
			})
			world.drafted.push(draft)
			throw { kind: "cancelled" }
		}

		const adding = controller.addCompanion(SUGGESTED_SCOUT.id)
		expect(controller.getState().isBusy).toBe(true)

		created?.()
		await adding
		expect(controller.getState().isBusy).toBe(false)
	})

	it("selects the created companion and ends the first run when the reader opens it", async () => {
		await controller.pickCompanion()
		await controller.addCompanion(SUGGESTED_SCOUT.id)

		await controller.openCompanion()

		expect(world.opened).toEqual(["bot-scout"])
		expect(controller.getState().step).toBe("done")
		expect(world.firstRunDone).toBe(1)
	})

	it("ends the first run and moves nobody when the reader stays", async () => {
		await controller.pickCompanion()
		await controller.addCompanion(SUGGESTED_SCOUT.id)

		await controller.finish()

		expect(world.opened).toEqual([])
		expect(world.firstRunDone).toBe(1)
	})

	it("sends the typed words to the companion the onboarding runs in", async () => {
		await controller.pickCompanion()

		await controller.askInOwnWords("someone who drafts my emails")

		expect(world.sent.at(-1)).toBe("someone who drafts my emails")
		expect(world.drafted).toEqual([])
		expect(controller.getState().step).toBe("done")
		expect(world.firstRunDone).toBe(1)
	})

	it("ends the first run when the reader skips the picker", async () => {
		await controller.pickCompanion()

		await controller.finish()

		expect(controller.getState().step).toBe("done")
		expect(world.firstRunDone).toBe(1)
	})
})
