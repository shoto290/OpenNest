import { Markdown } from "@workspace/ui/components/markdown"
import { MessageAttachments } from "@workspace/ui/components/message-attachments"

import type { MessageContent } from "@/lib/chat/message-attachments"
import { openAttachment } from "@/lib/links/open-attachment"

export const TurnBody = ({ attachments, text }: MessageContent) => (
	<>
		<MessageAttachments items={attachments} onOpen={openAttachment} />
		{text ? <Markdown>{text}</Markdown> : null}
	</>
)
