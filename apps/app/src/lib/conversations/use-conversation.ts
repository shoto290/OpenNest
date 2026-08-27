import { useEffect, useMemo, useRef, useSyncExternalStore } from "react"

import type {
	ConversationController,
	ConversationState,
} from "./conversation-controller"
import type { ConversationRuntimes } from "./conversation-runtimes"
import type { Conversation } from "./store-contract"
import {
	type ConversationPreviews,
	type LastWord,
	lastWordIn,
} from "./transcript-state"

export type ConversationChat = {
	state: ConversationState
	controller: ConversationController
}

export const useConversation = (
	runtimes: ConversationRuntimes,
	conversation: Conversation,
): ConversationChat => {
	const controller = useMemo(
		() => runtimes.runtimeFor(conversation.id),
		[runtimes, conversation.id],
	)
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	useEffect(() => {
		void controller.open(conversation)
	}, [controller, conversation])

	return { state, controller }
}

export type ConversationWorkers = Record<string, string[]>

const NO_WORKERS: string[] = []

const useHeldRecord = <Value>(
	runtimes: ConversationRuntimes,
	conversationIds: string[],
	readFor: (conversationId: string) => Value,
	signOf: (value: Value) => string,
): Record<string, Value> => {
	const held = useRef<{
		signature: string
		record: Record<string, Value>
	} | null>(null)

	return useSyncExternalStore(runtimes.subscribe, () => {
		const rows = conversationIds.map((id): [string, Value] => [id, readFor(id)])
		const signature = rows
			.map(([id, value]) => `${id}:${signOf(value)}`)
			.join("|")
		if (held.current?.signature !== signature) {
			held.current = { signature, record: Object.fromEntries(rows) }
		}
		return held.current.record
	})
}

const workersIn = (controller: ConversationController | null): string[] => {
	if (!controller) {
		return NO_WORKERS
	}
	const { speakingBotId, waitingBotIds } = controller.getState()
	return speakingBotId ? [speakingBotId, ...waitingBotIds] : waitingBotIds
}

export const useConversationWorkers = (
	runtimes: ConversationRuntimes,
	conversationIds: string[],
): ConversationWorkers =>
	useHeldRecord(
		runtimes,
		conversationIds,
		(id) => workersIn(runtimes.heldFor(id)),
		(botIds) => botIds.join(","),
	)

const heldWordIn = (
	controller: ConversationController | null,
): LastWord | undefined =>
	controller ? lastWordIn(controller.getState().messages) : undefined

export const useConversationPreviews = (
	runtimes: ConversationRuntimes,
	conversationIds: string[],
	stored: ConversationPreviews,
): ConversationPreviews =>
	useHeldRecord(
		runtimes,
		conversationIds,
		(id) => heldWordIn(runtimes.heldFor(id)) ?? stored[id],
		(word) =>
			`${word?.at ?? ""}:${word?.authorBotId ?? ""}:${word?.text ?? ""}`,
	)
