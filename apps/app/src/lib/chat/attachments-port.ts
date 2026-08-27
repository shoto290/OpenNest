import type { AttachmentsPort } from "./attachments-controller"
import type { ChatController } from "./chat-controller"

import type { ConversationRuntimes } from "../conversations/conversation-runtimes"

export type AttachmentsHosts = {
	chat: Pick<ChatController, "storeAttachments" | "sendTo">
	runtimes: Pick<ConversationRuntimes, "heldFor">
}

export const createAttachmentsPort = ({
	chat,
	runtimes,
}: AttachmentsHosts): AttachmentsPort => ({
	store: (owner, attachments) => chat.storeAttachments(owner.id, attachments),

	send: (owner, text, repliedToMessageId) => {
		if (owner.kind === "bot") {
			void chat.sendTo(owner.id, text, repliedToMessageId)
			return true
		}
		const runtime = runtimes.heldFor(owner.id)
		if (!runtime) {
			return false
		}
		void runtime.send(text, repliedToMessageId)
		return true
	},
})
