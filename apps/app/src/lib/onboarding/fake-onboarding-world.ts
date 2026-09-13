import type { OnboardingWorld } from "./onboarding-controller"

export type OnboardingGreeting = {
	botId: string
	text: string
}

export type OnboardingRefusals = {
	greet?: unknown
}

export type FakeOnboardingWorld = OnboardingWorld & {
	homeBot: string | null
	refusals: OnboardingRefusals
	sent: string[]
	greetings: OnboardingGreeting[]
	firstRunDone: number
}

const HOME_BOT = "bot-home"

const refuseWith = (refusal: unknown) => {
	if (refusal !== undefined) {
		throw refusal
	}
}

export const createFakeOnboardingWorld = (): FakeOnboardingWorld => {
	const fake: FakeOnboardingWorld = {
		homeBot: HOME_BOT,
		refusals: {},
		sent: [],
		greetings: [],
		firstRunDone: 0,

		homeBotId: () => fake.homeBot,

		send: async (text) => {
			fake.sent.push(text)
		},

		greet: async (botId, text) => {
			refuseWith(fake.refusals.greet)
			fake.greetings.push({ botId, text })
		},

		markFirstRunDone: async () => {
			fake.firstRunDone += 1
		},
	}

	return fake
}
