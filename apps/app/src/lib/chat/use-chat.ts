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
