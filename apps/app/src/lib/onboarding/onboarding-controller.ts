import {
	type NoticeMessage,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { exitDetailOf, isNotRunning } from "./onboarding-failure"
import type { OnboardingPort } from "./onboarding-port"
import {
	type OnboardingSummons,
	onboardingSummonsFor,
} from "./onboarding-summons"

import type { CheckReport } from "../agent/contract"
import type { CompanionCreated } from "../companions/companions-transport"

export type ConnectionStep =
	| { state: "detected"; account: string }
	| { state: "offer" }
	| { state: "waiting"; signInUrl: string }
	| { state: "apiKey" }
	| { state: "signInFailed"; exitDetail: string }
	| { state: "apiKeyFailed"; exitDetail: string }

export type OnboardingStep = "welcome" | "connection" | "summoned" | "done"

export type OnboardingState = {
	step: OnboardingStep
	connection: ConnectionStep | null
	round: number
	summons: string | null
	isBusy: boolean
	homeBotId: string | null
}

export type OnboardingWorld = {
	homeBotId: () => string | null
	send: (text: string) => Promise<void>
	greet: (botId: string, text: string) => Promise<void>
	markFirstRunDone: () => Promise<void>
}

export type OnboardingController = {
	getState: () => OnboardingState
	subscribe: (listener: () => void) => () => void
	start: () => Promise<void>
	tellMore: () => Promise<void>
	acceptAccount: () => Promise<void>
	changeAccount: () => void
	askApiKey: () => void
	signIn: () => Promise<void>
	submitCode: (code: string) => Promise<void>
	submitApiKey: (apiKey: string) => Promise<void>
	pasteKeyInstead: () => Promise<void>
	summonAgain: () => Promise<void>
	pickCompanion: () => Promise<void>
	greetCompanion: (created: CompanionCreated) => Promise<void>
	finish: () => Promise<void>
}

const initialOnboardingState: OnboardingState = {
	step: "welcome",
	connection: null,
	round: 0,
	summons: null,
	isBusy: false,
	homeBotId: null,
}

const ACCOUNT_PLAN_SEPARATOR = " · "

const accountLineOf = (email: string, plan: string | null | undefined) =>
	plan ? `${email}${ACCOUNT_PLAN_SEPARATOR}${plan}` : email

export type OnboardingControllerOptions = {
	reportFailure?: (notice: NoticeMessage) => void
}

export const createOnboardingController = (
	port: OnboardingPort,
	world: OnboardingWorld,
	{ reportFailure = raiseFailureNotice }: OnboardingControllerOptions = {},
): OnboardingController => {
	let state = initialOnboardingState
	let asked: OnboardingSummons = "greeting"
	let attempt = 0
	let running: Attempt | null = null
	const listeners = new Set<() => void>()

	const publish = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const set = (fields: Partial<OnboardingState>) => {
		state = { ...state, ...fields }
		publish()
	}

	const showConnection = (connection: ConnectionStep) => {
		set({
			step: "connection",
			connection,
			round: state.round + 1,
			summons: null,
			isBusy: false,
		})
	}

	const showFailed = (reason: unknown) => {
		showConnection({ state: "signInFailed", exitDetail: exitDetailOf(reason) })
	}

	const askApiKey = () => showConnection({ state: "apiKey" })

	const settle = async () => {
		const summons = onboardingSummonsFor(asked)
		set({
			step: "summoned",
			connection: null,
			round: state.round + 1,
			summons,
		})
		await world.send(summons)
	}

	const show = async (report: CheckReport) => {
		if (report.error && report.error.kind !== "notAuthenticated") {
			showFailed(report.error)
			return
		}
		if (!report.authenticated) {
			showConnection({ state: "offer" })
			return
		}
		const email = report.account?.email
		if (!email) {
			await settle()
			return
		}
		showConnection({
			state: "detected",
			account: accountLineOf(email, report.account?.plan),
		})
	}

	const readAccount = async () => {
		set({ isBusy: true })
		try {
			await show(await port.check())
		} catch (reason) {
			showFailed(reason)
		} finally {
			set({ isBusy: false })
		}
	}

	const askFor = (summons: OnboardingSummons) => {
		asked = summons
		set({ homeBotId: world.homeBotId() })
		return readAccount()
	}

	const finishRun = () => {
		set({ step: "done", connection: null })
		return world.markFirstRunDone()
	}

	const report = (title: string, reason: unknown) => {
		reportFailure({ title, description: exitDetailOf(reason) })
	}

	const pickCompanion = () => {
		set({ step: "done", connection: null })
		return world.send(onboardingSummonsFor("firstCompanion"))
	}

	const greetCompanion = async (created: CompanionCreated) => {
		try {
			await world.greet(created.id, onboardingSummonsFor("arrival"))
		} catch (reason) {
			report(
				i18n.t("chat:onboarding.handoff.failure", { name: created.name }),
				reason,
			)
		}
	}

	const openAttempt = () => {
		attempt += 1
		const mine = attempt
		const isLive = () => mine === attempt

		return {
			isLive,
			fail: (reason: unknown) => {
				if (isLive()) {
					showFailed(reason)
				}
			},
		}
	}

	type Attempt = ReturnType<typeof openAttempt>

	const waitingOn = (live: Attempt) => (signInUrl: string) => {
		if (!live.isLive()) {
			return
		}
		showConnection({ state: "waiting", signInUrl })
		port.openSignInUrl(signInUrl).catch(live.fail)
	}

	const isSigningIn = () => running?.isLive() ?? false

	const signIn = async () => {
		if (isSigningIn()) {
			await endSignIn()
		}
		const live = openAttempt()
		running = live
		set({ isBusy: true })
		let stopListening: (() => void) | undefined
		try {
			stopListening = await port.onSignInStarted(waitingOn(live))
			await port.signIn()
			if (live.isLive()) {
				await settle()
			}
		} catch (reason) {
			live.fail(reason)
		} finally {
			stopListening?.()
			if (running === live) {
				running = null
			}
			if (live.isLive()) {
				set({ isBusy: false })
			}
		}
	}

	const ignoringNotRunning = async (call: () => Promise<void>) => {
		try {
			await call()
		} catch (reason) {
			if (!isNotRunning(reason)) {
				showFailed(reason)
			}
		}
	}

	const endSignIn = async () => {
		attempt += 1
		await ignoringNotRunning(() => port.cancelSignIn())
	}

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		start: () => askFor("greeting"),

		tellMore: () => askFor("purpose"),

		acceptAccount: settle,

		changeAccount: () => showConnection({ state: "offer" }),

		askApiKey,

		signIn,

		submitCode: async (code) => {
			set({ isBusy: true })
			await ignoringNotRunning(() => port.enterCode(code))
			set({ isBusy: false })
		},

		submitApiKey: async (apiKey) => {
			set({ isBusy: true })
			if (isSigningIn()) {
				await endSignIn()
			}
			try {
				await port.holdApiKey(apiKey)
			} catch (reason) {
				showConnection({
					state: "apiKeyFailed",
					exitDetail: exitDetailOf(reason),
				})
				return
			}
			await readAccount()
		},

		pasteKeyInstead: async () => {
			askApiKey()
			await endSignIn()
		},

		summonAgain: settle,

		pickCompanion,

		greetCompanion,

		finish: finishRun,
	}
}
