import { useState, useSyncExternalStore } from "react"

import { createSecrets } from "./create-secrets"
import {
	createSecretsController,
	type SecretsController,
	type SecretsState,
} from "./secrets-controller"

export type Secrets = {
	state: SecretsState
	controller: SecretsController
}

export const useSecrets = (): Secrets => {
	const [controller] = useState(() => createSecretsController(createSecrets()))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
