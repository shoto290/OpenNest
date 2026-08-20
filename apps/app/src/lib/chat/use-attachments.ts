import {
	type RefObject,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react"

import { NO_ATTACHMENTS, type StagedAttachment } from "./attachments"
import type { AttachmentStoreError } from "./attachments-contract"
import type { AttachmentsController } from "./attachments-controller"
import { watchConversationDrags } from "./conversation-drags"

export type StagedFiles = {
	items: StagedAttachment[]
	refusal: AttachmentStoreError | null
	/** Whether files are being dragged over the conversation, which is what makes
	 * the composer wear the drop mark. */
	isDropTarget: boolean
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
 * A drop lands anywhere over the conversation rather than on the composer alone,
 * so the region the layout hands back is what tells a drag over it from one over
 * the roster beside it.
 */
export function useAttachments(
	controller: AttachmentsController,
	botId: string,
	canAttach: boolean,
	conversation: RefObject<HTMLElement | null>,
): StagedFiles {
	const state = useSyncExternalStore(controller.subscribe, controller.getState)
	const [isDropTarget, setIsDropTarget] = useState(false)

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

	useEffect(
		() =>
			watchConversationDrags({
				conversation,
				onHover: setIsDropTarget,
				onDrop: (files) => {
					if (canAttach) {
						bound.stage(files)
					}
				},
			}),
		[canAttach, bound, conversation],
	)

	return {
		items: state.staged[botId] ?? NO_ATTACHMENTS,
		refusal: state.refusals[botId] ?? null,
		isDropTarget,
		...bound,
	}
}
