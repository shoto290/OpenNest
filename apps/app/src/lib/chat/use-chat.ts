import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { type ChatController, createChatController } from "./chat-controller"
import type { ChatState } from "./chat-state"
import type { ChatDriver } from "./driver"
import { type SidebarActivity, sidebarActivityFor } from "./screen-model"

import type { TranscriptStore } from "../conversations/store-port"

export type Chat = {
	state: ChatState
	controller: ChatController
}

export function useChat(driver: ChatDriver, store: TranscriptStore): Chat {
	const [controller] = useState(() => createChatController(driver, store))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	useEffect(() => controller.attach(), [controller])

	return { state, controller }
}

/** What each bot is busy with, its own process each. Read from the controller
 * rather than from the chat on the screen: a bot answering while the reader is
 * elsewhere moves nothing the selected state can show, and the roster is where they
 * see that it is still working.
 *
 * Held between reads on a signature of what it derives, because React reads a
 * snapshot on every publish and a fresh object each time would re-render the roster
 * on every token of every bot. It changes when a bot starts, stops, or changes what
 * it is doing, and not once in between. */
export function useBotActivity(
	controller: ChatController,
	botIds: string[],
): Record<string, SidebarActivity> {
	const held = useRef<{ signature: string; activity: BotActivity } | null>(null)

	return useSyncExternalStore(controller.subscribe, () => {
		const activity = Object.fromEntries(
			botIds.map((id) => [id, sidebarActivityFor(controller.stateFor(id))]),
		)
		const signature = signatureOf(activity)
		if (held.current?.signature !== signature) {
			held.current = { signature, activity }
		}
		return held.current.activity
	})
}

type BotActivity = Record<string, SidebarActivity>

const signatureOf = (activity: BotActivity): string =>
	Object.entries(activity)
		.map(([id, busy]) => `${id}:${busy.isWorking}:${busy.kind ?? ""}`)
		.join("|")
