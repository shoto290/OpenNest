import { useState, useSyncExternalStore } from "react"

import {
	type BotSecretsController,
	type BotSecretsState,
	createBotSecretsController,
} from "./bot-secrets-controller"
import { createSecrets } from "./create-secrets"

export type BotSecrets = {
	state: BotSecretsState
	controller: BotSecretsController
}

export const useBotSecrets = (): BotSecrets => {
	const [controller] = useState(() =>
		createBotSecretsController(createSecrets()),
	)
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
