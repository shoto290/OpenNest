import { useState, useSyncExternalStore } from "react"

import {
	createUserController,
	type UserController,
	type UserState,
} from "./user-controller"

export type User = {
	state: UserState
	controller: UserController
}

export const useUser = (): User => {
	const [controller] = useState(createUserController)
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
