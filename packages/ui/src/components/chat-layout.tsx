import type { ReactNode } from "react"

import { ChatMarkProvider } from "@workspace/ui/components/chat-mark-context"
import { MessageScroller } from "@workspace/ui/components/message-scroller"
import { cn } from "@workspace/ui/lib/utils"

interface ChatLayoutProps {
	/** Fixed bar above the transcript. */
	header?: ReactNode
	/** Notices and banners, stacked directly above the composer. */
	notice?: ReactNode
	/** The composer. Keeps its natural height whatever the transcript does. */
	composer?: ReactNode
	/** Marks the transcript as waiting for more streamed content. */
	busy?: boolean
	/** Accessible name of the scrollable transcript. */
	label?: string
	/** The transcript. Stretches to the full height between header and composer,
	 * so a lone child can centre itself with `m-auto`. Rows here share one mark
	 * identity, so the bot's mark travels between them rather than reappearing. */
	children: ReactNode
	className?: string
	contentClassName?: string
}

function ChatLayout({
	header,
	notice,
	composer,
	busy,
	label = "Conversation",
	children,
	className,
	contentClassName,
}: ChatLayoutProps) {
	return (
		<div
			data-slot="chat-layout"
			className={cn(
				"flex h-svh flex-col bg-background text-foreground",
				className,
			)}
		>
			{header}

			<MessageScroller
				className="flex-1"
				busy={busy}
				label={label}
				contentClassName={cn(
					"mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-6 py-8",
					contentClassName,
				)}
			>
				<ChatMarkProvider>{children}</ChatMarkProvider>
			</MessageScroller>

			{notice || composer ? (
				<div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-3 px-6 pb-6">
					{notice}
					{composer}
				</div>
			) : null}
		</div>
	)
}

export { ChatLayout, type ChatLayoutProps }
