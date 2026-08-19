import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { type ChatController, createChatController } from "./chat-controller"
import type { ChatState } from "./chat-state"
import type { ChatDriver } from "./driver"
import { type SidebarActivity, sidebarActivityFor } from "./screen-model"

import type { TranscriptStore } from "../conversations/store-port"
import { type LastWord, lastWordIn } from "../conversations/transcript-state"

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
type BotActivity = Record<string, SidebarActivity>

const signatureOf = (busy: [string, SidebarActivity][]): string =>
	busy
		.map(
			([id, activity]) => `${id}:${activity.isWorking}:${activity.kind ?? ""}`,
		)
		.join("|")

export function useBotActivity(
	controller: ChatController,
	botIds: string[],
): BotActivity {
	const held = useRef<{ signature: string; activity: BotActivity } | null>(null)

	return useSyncExternalStore(controller.subscribe, () => {
		const busy: [string, SidebarActivity][] = botIds.map((id) => [
			id,
			sidebarActivityFor(controller.stateFor(id)),
		])
		const signature = signatureOf(busy)
		if (held.current?.signature !== signature) {
			held.current = { signature, activity: Object.fromEntries(busy) }
		}
		return held.current.activity
	})
}

/** The last word in each bot's conversation and when it was said, whoever said it.
 * Read from the controller for the reason the activity is: a message that settles
 * while the reader is elsewhere moves the row it belongs to, not the row they are
 * on.
 *
 * `stored` is what the roster read off the record, and it answers for every bot this
 * launch has not opened — a bot with no runtime yet has no messages here, which is
 * an empty conversation to this side and a preview waiting to be shown to the
 * reader. Once a bot is open its own transcript is the newer of the two.
 *
 * Held on a signature of what it derives, so a streamed token does not re-render the
 * roster. */
type BotPreviews = Record<string, LastWord | undefined>

const previewSignatureOf = (shown: [string, LastWord | undefined][]): string =>
	shown
		.map(([id, word]) => `${id}:${word?.at ?? ""}:${word?.text ?? ""}`)
		.join("|")

export function useBotPreviews(
	controller: ChatController,
	botIds: string[],
	stored: BotPreviews,
): BotPreviews {
	const held = useRef<{ signature: string; previews: BotPreviews } | null>(null)

	return useSyncExternalStore(controller.subscribe, () => {
		const shown: [string, LastWord | undefined][] = botIds.map((id) => [
			id,
			lastWordIn(controller.stateFor(id).messages) ?? stored[id],
		])
		const signature = previewSignatureOf(shown)
		if (held.current?.signature !== signature) {
			held.current = { signature, previews: Object.fromEntries(shown) }
		}
		return held.current.previews
	})
}
