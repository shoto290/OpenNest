import type { ReactNode, Ref } from "react"

import { ChatMarkProvider } from "@workspace/ui/components/chat-mark-context"
import {
	MessageScroller,
	type MessageScrollerOlder,
} from "@workspace/ui/components/message-scroller"
import { cn } from "@workspace/ui/lib/utils"

interface ChatLayoutProps {
	header?: ReactNode
	notice?: ReactNode
	composer?: ReactNode
	busy?: boolean
	label?: string
	older?: MessageScrollerOlder
	children: ReactNode
	rootRef?: Ref<HTMLDivElement>
	className?: string
	contentClassName?: string
}

function ChatLayout({
	header,
	notice,
	composer,
	busy,
	label,
	older,
	children,
	rootRef,
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
				busy={busy}
				label={label}
				older={older}
				contentClassName={cn(
					"flex min-h-full w-full flex-col gap-6 px-6 py-8",
					contentClassName,
				)}
			>
				<ChatMarkProvider>{children}</ChatMarkProvider>
			</MessageScroller>

			{notice || composer ? (
				<div className="flex w-full shrink-0 flex-col gap-3 px-6 pb-6">
					{notice}
					{composer}
				</div>
			) : null}
		</div>
	)
}

export { ChatLayout, type ChatLayoutProps }
