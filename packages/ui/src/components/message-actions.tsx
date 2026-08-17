"use client"

import { type ReactNode, useContext } from "react"

import { MessageSideContext } from "@workspace/ui/components/agents/message-context"
import { Button } from "@workspace/ui/components/button"

interface MessageActionsProps {
	/** Icon buttons for this bubble, usually `MessageAction`. Hand it nothing —
	 * or nothing that renders — and the row collapses rather than leaving a gap. */
	actions?: ReactNode
	/** The bubble body. Wrapping it is what keeps the row as narrow as the
	 * bubble, so the actions land against its edge and not the transcript's. */
	children: ReactNode
}

interface MessageActionProps {
	/** Names the button and fills its tooltip — an icon on its own says nothing. */
	label: string
	onClick: () => void
	/** Keeps the button on screen without a hover. Reach for it when the action
	 * is the way out of a state the reader did not choose, such as a retry on a
	 * prompt that never landed: an offer nobody can see is not an offer. */
	alwaysVisible?: boolean
	children: ReactNode
}

/** Faded rather than removed, so the button keeps its place in the tab order and
 * reaching it by keyboard lights the row it belongs to. The fade itself rides on
 * the transition `Button` already carries. It answers to this row's own group, so
 * a `MessageAction` reveals wherever the row is put rather than only inside a
 * `MessageBubble`. */
const HOVER_REVEAL =
	"opacity-0 group-focus-within/message-actions:opacity-100 group-hover/message-actions:opacity-100 motion-reduce:transition-none"

const ROW_SIDE_START = "group/message-actions flex max-w-full items-start gap-1"
const ROW_SIDE_END = `${ROW_SIDE_START} flex-row-reverse`

/** Puts a bubble's actions on the far side of it: right of the bot, left of the
 * reader, read off `MessageSideContext` so no caller repeats which side it is
 * on. Their room is held from the first paint, so revealing them never reflows
 * the bubble and a long one never pushes them out of the transcript. */
function MessageActions({ actions, children }: MessageActionsProps) {
	const side = useContext(MessageSideContext) ?? "start"

	return (
		<div
			data-slot="message-actions"
			className={side === "end" ? ROW_SIDE_END : ROW_SIDE_START}
		>
			{children}
			{/* `mt-2.5` matches the bubble's own top padding, which lands the button
			 * on the middle of the first line rather than above it. */}
			<div className="mt-2.5 flex items-center gap-0.5 empty:hidden">
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
