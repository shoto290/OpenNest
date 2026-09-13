import type { OnboardingState } from "./onboarding-controller"
import {
	type OnboardingStepQuestion,
	onboardingStepOf,
} from "./onboarding-steps"
import { type SummonOutcome, summonOutcomeOf } from "./onboarding-summons"
import type { Onboarding } from "./use-onboarding"

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
