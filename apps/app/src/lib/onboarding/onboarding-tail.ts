import type { OnboardingState } from "./onboarding-controller"
import {
	connectionStepOf,
	type OnboardingStepQuestion,
	onboardingStepOf,
} from "./onboarding-steps"
import { type SummonOutcome, summonOutcomeOf } from "./onboarding-summons"
import type { Onboarding } from "./use-onboarding"
import type { SignIn } from "./use-sign-in"

import type { ChatState } from "../chat/chat-state"

export type OnboardingTail = {
	step: OnboardingStepQuestion | null
}

const PENDING: SummonOutcome = { kind: "pending" }

const outcomeOf = (state: OnboardingState, chat: ChatState): SummonOutcome =>
	state.step === "summoned" && state.summons
		? summonOutcomeOf(chat, state.summons)
		: PENDING

const runsIn = (state: OnboardingState, botId: string) =>
	state.homeBotId === null || state.homeBotId === botId

export const onboardingTailOf = (
	onboarding: Onboarding | undefined,
	chat: ChatState,
	botId: string,
): OnboardingTail | null => {
	if (!onboarding || onboarding.state.step === "done") {
		return null
	}
	const { state, controller } = onboarding
	if (!runsIn(state, botId)) {
		return null
	}

	return {
		step: onboardingStepOf(state, outcomeOf(state, chat), controller),
	}
}

export const signInTailOf = (
	signIn: SignIn | undefined,
	botId: string,
): OnboardingTail | null => {
	const connection = signIn?.state.connection
	if (!signIn || !connection || signIn.state.botId !== botId) {
		return null
	}
	const id = `sign-in-${connection.state}-${signIn.state.round}`

	return { step: connectionStepOf(connection, id, signIn.controller) }
}
