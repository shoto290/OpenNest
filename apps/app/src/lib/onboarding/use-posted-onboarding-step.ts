import { useEffect } from "react"

import type { OnboardingStepQuestion } from "./onboarding-steps"

import type { ChatController } from "../chat/chat-controller"

type PostedOnboardingStepInput = {
	controller: ChatController
	botId: string
	pendingId: string | null
	step: OnboardingStepQuestion | null
}

export const usePostedOnboardingStep = ({
	controller,
	botId,
	pendingId,
	step,
}: PostedOnboardingStepInput) => {
	useEffect(() => {
		if (pendingId && pendingId !== step?.request.id) {
			controller.withdrawQuestion(botId, pendingId)
		}
		if (step) {
			controller.postQuestion(botId, step.request, step.onAnswers)
		}
	}, [controller, botId, pendingId, step])
}
