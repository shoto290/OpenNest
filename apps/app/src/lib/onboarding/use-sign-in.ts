import { useState, useSyncExternalStore } from "react"

import type { OnboardingPort } from "./onboarding-port"
import {
	createSignInController,
	type SignInController,
	type SignInState,
	type SignInWorld,
} from "./sign-in-controller"

export type SignIn = {
	state: SignInState
	controller: SignInController
}

export const useSignIn = (port: OnboardingPort, world: SignInWorld): SignIn => {
	const [controller] = useState(() => createSignInController(port, world))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
