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
import type {
	AvatarAnimal,
	AvatarBlot,
	Bot,
	BotDraft,
	SuggestedBot,
} from "../conversations/store-contract"

export type ConnectionStep =
	| { state: "detected"; account: string }
	| { state: "offer" }
	| { state: "waiting"; signInUrl: string }
	| { state: "apiKey" }
	| { state: "signInFailed"; exitDetail: string }
	| { state: "apiKeyFailed"; exitDetail: string }

export type OnboardingStep =
	| "welcome"
	| "connection"
	| "summoned"
	| "picking"
	| "handoff"
	| "done"

export type OnboardingHandoff = {
	botId: string
	name: string
	description: string
	animal: AvatarAnimal
	blot: AvatarBlot | null
}

export type OnboardingState = {
	step: OnboardingStep
	connection: ConnectionStep | null
	round: number
	summons: string | null
	isBusy: boolean
	homeBotId: string | null
	suggestions: SuggestedBot[]
	handoff: OnboardingHandoff | null
}

export type OnboardingWorld = {
	homeBotId: () => string | null
	send: (text: string) => Promise<void>
	suggest: () => Promise<SuggestedBot[]>
	create: (draft: BotDraft) => Promise<Bot>
	greet: (botId: string, text: string) => Promise<void>
	open: (botId: string) => void
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
	addCompanion: (pickId: string) => Promise<void>
	askInOwnWords: (request: string) => Promise<void>
	openCompanion: () => Promise<void>
	finish: () => Promise<void>
}

const initialOnboardingState: OnboardingState = {
	step: "welcome",
	connection: null,
	round: 0,
	summons: null,
	isBusy: false,
	homeBotId: null,
	suggestions: [],
	handoff: null,
}

const NO_SUGGESTION = { kind: "noSuggestion" } as const

const draftOf = ({ name, job, description }: SuggestedBot): BotDraft => ({
	name,
	job,
	description,
})

const handoffOf = (created: Bot, description: string): OnboardingHandoff => ({
	botId: created.id,
	name: created.name,
	description,
	animal: created.avatarAnimal,
	blot: created.avatarBlot,
})

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

	const readSuggestions = async () => {
		set({ isBusy: true })
		try {
			const read = await world.suggest()
			if (read.length === 0) {
				throw NO_SUGGESTION
			}
			set({ step: "picking", connection: null, suggestions: read })
		} catch (reason) {
			report(i18n.t("chat:onboarding.picker.failure.suggestions"), reason)
			set({ round: state.round + 1 })
		} finally {
			set({ isBusy: false })
		}
	}

	const greet = async (created: Bot) => {
		try {
			await world.greet(created.id, onboardingSummonsFor("arrival"))
		} catch (reason) {
			report(
				i18n.t("chat:onboarding.handoff.failure", { name: created.name }),
				reason,
			)
		}
	}

	const addCompanion = async (pickId: string) => {
		const pick = state.suggestions.find(({ id }) => id === pickId)
		if (!pick || state.isBusy) {
			return
		}
		set({ isBusy: true })
		try {
			const created = await world.create(draftOf(pick))
			set({ step: "handoff", handoff: handoffOf(created, pick.blurb) })
			await greet(created)
		} catch (reason) {
			report(
				i18n.t("chat:onboarding.picker.failure.add", { name: pick.name }),
				reason,
			)
		} finally {
			set({ isBusy: false })
		}
	}

	const openCompanion = async () => {
		const opened = state.handoff
		if (opened) {
			world.open(opened.botId)
		}
		await finishRun()
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

		pickCompanion: readSuggestions,

		addCompanion,

		askInOwnWords: async (request) => {
			await world.send(request)
			await finishRun()
		},

		openCompanion,

		finish: finishRun,
	}
}
