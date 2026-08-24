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
	isDropTarget: boolean
	stage: (files: File[]) => void
	remove: (id: string) => void
	submit: (text: string) => Promise<boolean>
	dismissRefusal: () => void
}

export function useAttachments(
	controller: AttachmentsController,
	botId: string,
	canAttach: boolean,
	conversation: RefObject<HTMLElement | null>,
): StagedFiles {
	const state = useSyncExternalStore(controller.subscribe, controller.getState)
	const [isDropTarget, setIsDropTarget] = useState(false)

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
