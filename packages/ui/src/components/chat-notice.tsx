import { cva, type VariantProps } from "class-variance-authority"
import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

const chatNoticeVariants = cva(
	"flex w-full items-start gap-3 rounded-2xl border p-3 text-sm",
	{
		variants: {
			tone: {
				warning: "border-amber-500/30 bg-amber-500/10",
				error: "border-destructive/30 bg-destructive/10",
			},
		},
		defaultVariants: {
			tone: "error",
		},
	},
)

type ChatNoticeTone = NonNullable<
	VariantProps<typeof chatNoticeVariants>["tone"]
>

const TONE_ICON = {
	warning: Icons.Info,
	error: Icons.Alert,
} satisfies Record<ChatNoticeTone, typeof Icons.Info>

const TONE_ICON_CLASS = {
	warning: "text-amber-600 dark:text-amber-400",
	error: "text-destructive",
} satisfies Record<ChatNoticeTone, string>

interface ChatNoticeRetry {
	onRetry: () => void
	label?: ReactNode
	attempt?: number
	maxAttempts?: number
}

interface ChatNoticeAction {
	label: ReactNode
	onClick: () => void
}

interface ChatNoticeProps {
	tone?: ChatNoticeTone
	title: ReactNode
	description?: ReactNode
	detail?: ReactNode
	retry?: ChatNoticeRetry
	action?: ChatNoticeAction
	onDismiss?: () => void
	className?: string
}

function isRetryAvailable(retry?: ChatNoticeRetry) {
	if (!retry) return false
	if (retry.maxAttempts === undefined) return true
	return (retry.attempt ?? 0) < retry.maxAttempts
}

function ChatNotice({
	tone = "error",
	title,
	description,
	detail,
	retry,
	action,
	onDismiss,
	className,
}: ChatNoticeProps) {
	const ToneIcon = TONE_ICON[tone]
	const retryAvailable = retry !== undefined && isRetryAvailable(retry)
	const exhaustedAfter =
		retry !== undefined && !retryAvailable ? retry.maxAttempts : undefined

	return (
		<div
			data-slot="chat-notice"
			data-tone={tone}
			role={tone === "error" ? "alert" : "status"}
			className={cn(chatNoticeVariants({ tone }), className)}
		>
			<ToneIcon
				aria-hidden
				className={cn("mt-0.5 size-4 shrink-0", TONE_ICON_CLASS[tone])}
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<div className="flex flex-col gap-1">
					<p className="font-medium text-foreground">{title}</p>
					{description ? (
						<p className="text-foreground/80">{description}</p>
					) : null}
					{detail ? (
						<code className="w-fit max-w-full truncate rounded-md bg-background/60 px-1.5 py-0.5 font-mono text-foreground/80 text-xs">
							{detail}
						</code>
					) : null}
				</div>
				{retryAvailable || exhaustedAfter !== undefined || action ? (
					<div className="flex flex-wrap items-center gap-2">
						{retryAvailable ? (
							<Button size="sm" variant="outline" onClick={retry.onRetry}>
								{retry.label ?? "Retry"}
							</Button>
						) : null}
						{action ? (
							<Button size="sm" variant="ghost" onClick={action.onClick}>
								{action.label}
							</Button>
						) : null}
						{exhaustedAfter !== undefined ? (
							<p className="text-foreground/80 text-xs">
								Retry limit reached after {exhaustedAfter} attempts
							</p>
						) : null}
					</div>
				) : null}
			</div>
			{onDismiss ? (
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Dismiss notice"
					onClick={onDismiss}
				>
					<Icons.Close />
				</Button>
			) : null}
		</div>
	)
}

export {
	ChatNotice,
	type ChatNoticeAction,
	type ChatNoticeProps,
	type ChatNoticeRetry,
	type ChatNoticeTone,
	chatNoticeVariants,
	isRetryAvailable,
}
