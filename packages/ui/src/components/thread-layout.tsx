import type { ReactNode, Ref } from "react"

import { MarkProvider } from "@workspace/ui/components/mark-context"
import {
	MessageScroller,
	type MessageScrollerHandle,
	type MessageScrollerOlder,
	type MessageScrollerRow,
	type MessageScrollerTrace,
} from "@workspace/ui/components/message-scroller"
import {
	PromptReply,
	type ReplyQuote,
} from "@workspace/ui/components/prompt-reply"
import { cn } from "@workspace/ui/lib/utils"

const TRANSCRIPT_ROW_GAP = 24

interface ThreadLayoutProps {
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
	rows?: MessageScrollerRow[]
	onFollowChange?: (following: boolean) => void
	onLandingTrace?: (event: MessageScrollerTrace) => void
	children: ReactNode
	rootRef?: Ref<HTMLDivElement>
	scrollerRef?: Ref<MessageScrollerHandle>
	className?: string
	contentClassName?: string
}

function ThreadLayout({
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
	rows,
	onFollowChange,
	onLandingTrace,
	children,
	rootRef,
	scrollerRef,
	className,
	contentClassName,
}: ThreadLayoutProps) {
	return (
		<div
			ref={rootRef}
			data-slot="chat-layout"
			className={cn(
				"flex h-svh max-h-full flex-col bg-background text-foreground",
				className,
			)}
		>
			{header}

			<MarkProvider transcriptKey={transcriptKey}>
				<MessageScroller
					className="flex-1"
					transcriptKey={transcriptKey}
					busy={busy}
					label={label}
					older={older}
					rows={rows}
					rowGap={TRANSCRIPT_ROW_GAP}
					onFollowChange={onFollowChange}
					onLandingTrace={onLandingTrace}
					highlightedMessageId={highlightedMessageId}
					scrollerRef={scrollerRef}
					contentClassName={cn(
						"flex min-h-full w-full flex-col px-6 py-8",
						contentClassName,
					)}
				>
					{children}
				</MessageScroller>
			</MarkProvider>

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

export { ThreadLayout, type ThreadLayoutProps }
