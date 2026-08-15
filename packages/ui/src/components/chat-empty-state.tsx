import type { ComponentProps } from "react"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type ChatEmptyStateStatus = "ready" | "unavailable"

interface ChatEmptyStateProps extends Omit<ComponentProps<"div">, "children"> {
	status?: ChatEmptyStateStatus
	onSetup?: () => void
}

const CHAT_EMPTY_STATE_COPY = {
	ready: {
		title: "Start with Claude Code",
		description:
			"OpenNest runs the Claude Code CLI installed on this machine. Nothing leaves your device.",
	},
	unavailable: {
		title: "Claude Code is not available",
		description:
			"OpenNest cannot reach the Claude Code CLI on this machine. Finish setup to start a conversation.",
	},
} satisfies Record<ChatEmptyStateStatus, { title: string; description: string }>

function ChatEmptyState({
	status = "ready",
	onSetup,
	className,
	...props
}: ChatEmptyStateProps) {
	const { title, description } = CHAT_EMPTY_STATE_COPY[status]
	const isReady = status === "ready"
	const Mark = isReady ? Icons.Claude : Icons.Alert

	return (
		<div
			data-slot="chat-empty-state"
			data-status={status}
			className={cn(
				"flex w-full flex-col items-center gap-5 px-6 py-12 text-center",
				className,
			)}
			{...props}
		>
			<span
				className={cn(
					"flex size-12 items-center justify-center rounded-2xl border",
					isReady
						? "border-border bg-muted text-foreground"
						: "border-destructive bg-destructive/10 text-destructive",
				)}
			>
				<Mark aria-hidden="true" className="size-6" />
			</span>

			<div className="flex max-w-md flex-col gap-2">
				<h2 className="font-heading font-medium text-foreground text-lg">
					{title}
				</h2>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>

			{isReady ? (
				<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
					Type your first prompt in the composer below
					<Icons.ArrowDown aria-hidden="true" className="size-3.5" />
				</p>
			) : (
				<Button onClick={onSetup}>Set up Claude Code</Button>
			)}
		</div>
	)
}

export { ChatEmptyState, type ChatEmptyStateProps, type ChatEmptyStateStatus }
