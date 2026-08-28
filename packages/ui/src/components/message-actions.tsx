"use client"

import { type ReactNode, useContext } from "react"

import { Button } from "@workspace/ui/components/button"
import { MessageSideContext } from "@workspace/ui/components/message-side-context"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuTrigger,
} from "@workspace/ui/components/motion/context-menu"
import { cn } from "@workspace/ui/lib/utils"

interface MessageActionsProps {
	actions?: ReactNode
	menu?: ReactNode
	children: ReactNode
}

interface MessageActionProps {
	label: string
	onClick: () => void
	alwaysVisible?: boolean
	children: ReactNode
}

const HOVER_REVEAL =
	"opacity-0 group-focus-within/message:opacity-100 group-hover/message:opacity-100"

const ROW_SIDE_START = "flex max-w-full items-start gap-1"
const ROW_SIDE_END = `${ROW_SIDE_START} flex-row-reverse`

function MessageActions({ actions, menu, children }: MessageActionsProps) {
	const side = useContext(MessageSideContext) ?? "start"

	const row = (
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

	if (!menu) return row

	return (
		<ContextMenu>
			<ContextMenuTrigger announcesPopup={false}>{row}</ContextMenuTrigger>
			<ContextMenuContent>{menu}</ContextMenuContent>
		</ContextMenu>
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
