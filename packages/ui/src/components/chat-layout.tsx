import type { ReactNode, Ref } from "react"

import { ChatMarkProvider } from "@workspace/ui/components/chat-mark-context"
import {
	MessageScroller,
	type MessageScrollerHandle,
	type MessageScrollerOlder,
} from "@workspace/ui/components/message-scroller"
import {
	PromptReply,
	type ReplyQuote,
} from "@workspace/ui/components/prompt-reply"
import { cn } from "@workspace/ui/lib/utils"

interface ChatLayoutProps {
	header?: ReactNode
	notice?: ReactNode
	pending?: ReactNode
	composer?: ReactNode
	reply?: ReplyQuote
	highlightedMessageId?: string
	transcriptKey?: string
	busy?: boolean
	label?: string
	older?: MessageScrollerOlder
	children: ReactNode
	rootRef?: Ref<HTMLDivElement>
	scrollerRef?: Ref<MessageScrollerHandle>
	className?: string
	contentClassName?: string
}

function ChatLayout({
	header,
	notice,
	pending,
	composer,
	reply,
	highlightedMessageId,
	transcriptKey,
	busy,
	label,
	older,
	children,
	rootRef,
	scrollerRef,
	className,
	contentClassName,
}: ChatLayoutProps) {
	return (
		<div
			ref={rootRef}
			data-slot="chat-layout"
			className={cn(
				"flex h-svh flex-col bg-background text-foreground",
				className,
			)}
		>
			{header}

			<MessageScroller
				className="flex-1"
				transcriptKey={transcriptKey}
				busy={busy}
				label={label}
				older={older}
				highlightedMessageId={highlightedMessageId}
				scrollerRef={scrollerRef}
				contentClassName={cn(
					"flex min-h-full w-full flex-col gap-6 px-6 py-8",
					contentClassName,
				)}
			>
				<ChatMarkProvider transcriptKey={transcriptKey}>
					{children}
				</ChatMarkProvider>
			</MessageScroller>

			{notice || pending || composer ? (
				<div className="flex w-full shrink-0 flex-col gap-3 px-6 pb-6">
					{notice}
					{pending}
					{composer ? (
						<PromptReply quote={reply}>{composer}</PromptReply>
					) : null}
				</div>
			) : null}
		</div>
	)
}

export { ChatLayout, type ChatLayoutProps }
