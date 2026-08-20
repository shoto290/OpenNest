import { useEffect, useMemo, useSyncExternalStore } from "react"

import { NO_ATTACHMENTS, type StagedAttachment } from "./attachments"
import type { AttachmentStoreError } from "./attachments-contract"
import type { AttachmentsController } from "./attachments-controller"

const FILES = "Files"

/** The conversation as the DOM names it. A drop over the roster beside it is not a
 * drop on this composer. */
const CONVERSATION = '[data-slot="chat-layout"]'

const carriesFiles = (event: DragEvent) =>
	Boolean(event.dataTransfer?.types.includes(FILES))

const overConversation = (event: DragEvent) =>
	event.target instanceof Element && Boolean(event.target.closest(CONVERSATION))

export type StagedFiles = {
	items: StagedAttachment[]
	refusal: AttachmentStoreError | null
	stage: (files: File[]) => void
	remove: (id: string) => void
	/** Answers whether the prompt was taken, which is what tells the composer
	 * whether the draft may go. */
	submit: (text: string) => Promise<boolean>
	dismissRefusal: () => void
}

/**
 * One bot's staged files, and the window drags that reach them.
 *
 * A drop lands anywhere over the conversation rather than on the composer alone.
 * Every file drop over the window is taken from the browser either way — an
 * unhandled one navigates the webview away from the app — and only the ones over
 * the conversation, on a composer that can take them, are staged.
 */
export function useAttachments(
	controller: AttachmentsController,
	botId: string,
	canAttach: boolean,
): StagedFiles {
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	// Bound to this bot once: the composer is memoised, and a fresh handler per
	// render would re-render it on every streamed token.
	const bound = useMemo(
		() => ({
			stage: (files: File[]) => controller.stage(botId, files),
			remove: (id: string) => controller.remove(botId, id),
			submit: (text: string) => controller.submit(botId, text),
			dismissRefusal: () => controller.dismissRefusal(botId),
		}),
		[controller, botId],
	)

	useEffect(() => controller.release, [controller])

	useEffect(() => {
		const allow = (event: DragEvent) => {
			if (carriesFiles(event)) {
				event.preventDefault()
			}
		}
		const drop = (event: DragEvent) => {
			if (!carriesFiles(event)) {
				return
			}
			// The composer takes what is dropped on itself, and says so by preventing
			// the default before this listener sees the event.
			const taken = event.defaultPrevented
			event.preventDefault()
			if (taken || !canAttach || !overConversation(event)) {
				return
			}
			bound.stage(Array.from(event.dataTransfer?.files ?? []))
		}
		window.addEventListener("dragover", allow)
		window.addEventListener("drop", drop)
		return () => {
			window.removeEventListener("dragover", allow)
			window.removeEventListener("drop", drop)
		}
	}, [canAttach, bound])

	return {
		items: state.staged[botId] ?? NO_ATTACHMENTS,
		refusal: state.refusals[botId] ?? null,
		...bound,
	}
}
