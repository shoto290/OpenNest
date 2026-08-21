import { useState, useSyncExternalStore } from "react"

import {
	createSkillsController,
	type SkillsController,
	type SkillsState,
} from "./skills-controller"

import type { TranscriptStore } from "../conversations/store-port"

export type BotSkills = {
	state: SkillsState
	controller: SkillsController
}

export const useBotSkills = (store: TranscriptStore): BotSkills => {
	const [controller] = useState(() => createSkillsController(store))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
