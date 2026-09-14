import { exitDetailOf, isNotRunning } from "./onboarding-failure"
import type { OnboardingPort } from "./onboarding-port"

import type { CheckReport } from "../agent/contract"

export type ConnectionStep =
	| { state: "detected"; account: string }
	| { state: "offer" }
	| { state: "waiting"; signInUrl: string }
	| { state: "apiKey" }
	| { state: "signInFailed"; exitDetail: string }
	| { state: "apiKeyFailed"; exitDetail: string }

export type SignInActions = {
	acceptAccount: () => Promise<void>
	changeAccount: () => void
	askApiKey: () => void
	signIn: () => Promise<void>
	submitCode: (code: string) => Promise<void>
	submitApiKey: (apiKey: string) => Promise<void>
	pasteKeyInstead: () => Promise<void>
}

export type SignInHost = {
	showConnection: (connection: ConnectionStep) => void
	setBusy: (isBusy: boolean) => void
	settle: () => Promise<void>
}

export type SignInFlow = {
	readAccount: () => Promise<void>
	actions: SignInActions
}

const ACCOUNT_PLAN_SEPARATOR = " · "

const accountLineOf = (email: string, plan: string | null | undefined) =>
	plan ? `${email}${ACCOUNT_PLAN_SEPARATOR}${plan}` : email

export const createSignInFlow = (
	port: OnboardingPort,
	{ showConnection, setBusy, settle }: SignInHost,
): SignInFlow => {
	let attempt = 0
	let running: Attempt | null = null

	const showFailed = (reason: unknown) => {
		showConnection({ state: "signInFailed", exitDetail: exitDetailOf(reason) })
	}

	const askApiKey = () => showConnection({ state: "apiKey" })

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
		setBusy(true)
		try {
			await show(await port.check())
		} catch (reason) {
			showFailed(reason)
		} finally {
			setBusy(false)
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
		setBusy(true)
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
				setBusy(false)
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
		readAccount,
		actions: {
			acceptAccount: settle,

			changeAccount: () => showConnection({ state: "offer" }),

			askApiKey,

			signIn,

			submitCode: async (code) => {
				setBusy(true)
				await ignoringNotRunning(() => port.enterCode(code))
				setBusy(false)
			},

			submitApiKey: async (apiKey) => {
				setBusy(true)
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
		},
	}
}
