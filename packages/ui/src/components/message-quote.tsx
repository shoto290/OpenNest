"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import type { MessageFrom } from "@workspace/ui/components/message"
import { cn } from "@workspace/ui/lib/utils"

export interface QuotedMessage {
	author: string
	excerpt: string
	from: MessageFrom
	onJump: () => void
}

const QUOTE_TONE = {
	user: "bg-primary text-primary-foreground",
	assistant: "bg-muted text-foreground",
} satisfies Record<MessageFrom, string>

export interface MessageQuoteProps extends QuotedMessage {
	trailing?: ReactNode
	children?: ReactNode
	className?: string
}

export function MessageQuote({
	author,
	excerpt,
	from,
	onJump,
	trailing,
	children,
	className,
}: MessageQuoteProps) {
	const { t } = useTranslation("chat")

	return (
		<div
			role="group"
			aria-label={t("reply.label", { author })}
			data-slot="message-quote"
			data-from={from}
			className={cn(
				"w-fit max-w-full rounded-3xl",
				QUOTE_TONE[from],
				className,
			)}
		>
			<div className="flex flex-col gap-1 rounded-[inherit] bg-background/10 p-1">
				<div className="flex items-center gap-1.5 pt-1 pr-1 pl-2.5">
					<Icons.Reply
						aria-hidden="true"
						className="size-3.5 shrink-0 opacity-70"
					/>
					<button
						type="button"
						data-slot="message-quote-jump"
						onClick={onJump}
						className="flex min-w-0 flex-1 flex-col items-start rounded-md text-left transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-current motion-reduce:transition-none"
					>
						<span className="w-full truncate font-medium text-xs leading-4">
							{author}
						</span>
						<span className="w-full truncate text-xs leading-4">{excerpt}</span>
					</button>
					{trailing}
				</div>
				{children}
			</div>
		</div>
	)
}
