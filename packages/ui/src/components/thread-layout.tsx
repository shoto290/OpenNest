import type { ReactNode, Ref } from "react"

import { MarkProvider } from "@workspace/ui/components/mark-context"
import {
	PromptReply,
	type ReplyQuote,
} from "@workspace/ui/components/prompt-reply"
import {
	Transcript,
	type TranscriptHandle,
	type TranscriptItem,
	type TranscriptOlder,
} from "@workspace/ui/components/transcript"
import { cn } from "@workspace/ui/lib/utils"

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
	anchorOnSend?: boolean
	marksNewMessages?: boolean
	countsNewMessages?: boolean
	older?: TranscriptOlder
	rows?: TranscriptItem[]
	onFollowChange?: (following: boolean) => void
	children: ReactNode
	rootRef?: Ref<HTMLDivElement>
	scrollerRef?: Ref<TranscriptHandle>
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
	anchorOnSend,
	marksNewMessages,
	countsNewMessages,
	older,
	rows,
	onFollowChange,
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
				<Transcript
					className="flex-1"
					transcriptKey={transcriptKey}
					busy={busy}
					label={label}
					anchorOnSend={anchorOnSend}
					marksNewMessages={marksNewMessages}
					countsNewMessages={countsNewMessages}
					older={older}
					rows={rows}
					onFollowChange={onFollowChange}
					highlightedMessageId={highlightedMessageId}
					scrollerRef={scrollerRef}
					contentClassName={cn(
						"flex min-h-full w-full flex-col px-6 pt-8 pb-4",
						contentClassName,
					)}
				>
					{children}
				</Transcript>
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
