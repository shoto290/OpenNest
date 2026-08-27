import {
	type RefObject,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react"

import { NO_ATTACHMENTS, type StagedAttachment } from "./attachments"
import type {
	AttachmentStoreError,
	AttachmentsOwner,
} from "./attachments-contract"
import { type AttachmentsController, ownerKey } from "./attachments-controller"
import { watchConversationDrags } from "./conversation-drags"

export type StagedFiles = {
	items: StagedAttachment[]
	refusal: AttachmentStoreError | null
	isDropTarget: boolean
	stage: (files: File[]) => void
	remove: (id: string) => void
	submit: (text: string, repliedToMessageId?: string) => Promise<boolean>
	dismissRefusal: () => void
}

export function useAttachments(
	controller: AttachmentsController,
	owner: AttachmentsOwner,
	canAttach: boolean,
	conversation: RefObject<HTMLElement | null>,
): StagedFiles {
	const state = useSyncExternalStore(controller.subscribe, controller.getState)
	const [isDropTarget, setIsDropTarget] = useState(false)
	const key = ownerKey(owner)

	const bound = useMemo(
		() => ({
			stage: (files: File[]) => controller.stage(owner, files),
			remove: (id: string) => controller.remove(owner, id),
			submit: (text: string, repliedToMessageId?: string) =>
				controller.submit(owner, text, repliedToMessageId),
			dismissRefusal: () => controller.dismissRefusal(owner),
		}),
		[controller, owner],
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
		items: state.staged[key] ?? NO_ATTACHMENTS,
		refusal: state.refusals[key] ?? null,
		isDropTarget,
		...bound,
	}
}
