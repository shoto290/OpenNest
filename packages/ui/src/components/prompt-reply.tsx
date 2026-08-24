"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import {
	MessageQuote,
	type QuotedMessage,
} from "@workspace/ui/components/message-quote"
import { cn } from "@workspace/ui/lib/utils"

export interface PromptReplyProps extends QuotedMessage {
	onDismiss: () => void
	children: ReactNode
	className?: string
}

export function PromptReply({
	author,
	excerpt,
	from,
	onJump,
	onDismiss,
	children,
	className,
}: PromptReplyProps) {
	const { t } = useTranslation("chat")

	return (
		<MessageQuote
			author={author}
			excerpt={excerpt}
			from={from}
			onJump={onJump}
			className={cn("w-full rounded-4xl", className)}
			trailing={
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					aria-label={t("reply.dismiss")}
					onClick={onDismiss}
					className="rounded-full text-current opacity-70 hover:opacity-100"
				>
					<Icons.Close />
				</Button>
			}
		>
			{children}
		</MessageQuote>
	)
}
