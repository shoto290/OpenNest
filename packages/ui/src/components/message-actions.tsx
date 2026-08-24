"use client"

import { type ReactNode, useContext } from "react"

import { MessageSideContext } from "@workspace/ui/components/agents/message-context"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

interface MessageActionsProps {
	actions?: ReactNode
	children: ReactNode
}

interface MessageActionProps {
	label: string
	onClick: () => void
	alwaysVisible?: boolean
	children: ReactNode
}

const HOVER_REVEAL =
	"opacity-0 group-focus-within/message-actions:opacity-100 group-hover/message-actions:opacity-100"

const ROW_SIDE_START = "group/message-actions flex max-w-full items-start gap-1"
const ROW_SIDE_END = `${ROW_SIDE_START} flex-row-reverse`

function MessageActions({ actions, children }: MessageActionsProps) {
	const side = useContext(MessageSideContext) ?? "start"

	return (
		<div
			data-slot="message-actions"
			className={side === "end" ? ROW_SIDE_END : ROW_SIDE_START}
		>
			{children}
			<div
				className={cn(
					"mt-2.5 flex items-center gap-0.5 empty:hidden",
					side === "end" && "flex-row-reverse",
				)}
			>
				{actions}
			</div>
		</div>
	)
}

function MessageAction({
	label,
	onClick,
	alwaysVisible = false,
	children,
}: MessageActionProps) {
	return (
		<Button
			size="icon-xs"
			variant="ghost"
			aria-label={label}
			tooltip={label}
			onClick={onClick}
			className={alwaysVisible ? undefined : HOVER_REVEAL}
		>
			{children}
		</Button>
	)
}

export {
	MessageAction,
	type MessageActionProps,
	MessageActions,
	type MessageActionsProps,
}
