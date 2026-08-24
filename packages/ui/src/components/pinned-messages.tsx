"use client"

import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover"

const PINNED_AVATAR_SIZE = 24

interface PinnedMessage {
	id: string
	author: string
	avatar: ReactNode
	timestamp: string
	excerpt: string
}

interface PinnedMessagesProps {
	messages: PinnedMessage[]
	onJump: (messageId: string) => void
	onUnpin: (messageId: string) => void
	className?: string
}

interface PinnedMessageRowProps {
	message: PinnedMessage
	onJump: () => void
	onUnpin: () => void
}

const PinnedMessageRow = ({
	message: { author, avatar, timestamp, excerpt },
	onJump,
	onUnpin,
}: PinnedMessageRowProps) => {
	const { t } = useTranslation("chat")

	return (
		<li
			data-slot="pinned-message"
			className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-1 px-4 py-3 hover:bg-muted/40"
		>
			<span aria-hidden="true" className="row-span-2 shrink-0">
				{avatar}
			</span>
			<div className="flex items-center gap-2">
				<span className="min-w-0 truncate font-medium text-sm">{author}</span>
				<span className="shrink-0 text-muted-foreground text-xs">
					{timestamp}
				</span>
				<span className="-mr-1.5 ml-auto flex shrink-0 items-center gap-0.5">
					<Button
						data-slot="pinned-message-jump"
						size="xs"
						variant="ghost"
						aria-label={t("pinned.jumpTo", { author })}
						onClick={onJump}
					>
						{t("pinned.jump")}
					</Button>
					<Button
						data-slot="pinned-message-unpin"
						size="icon-xs"
						variant="ghost"
						aria-label={t("pinned.unpin", { author })}
						onClick={onUnpin}
					>
						<Icons.Unpin />
					</Button>
				</span>
			</div>
			<p className="line-clamp-3 text-muted-foreground text-sm">{excerpt}</p>
		</li>
	)
}

const PinnedMessages = ({
	messages,
	onJump,
	onUnpin,
	className,
}: PinnedMessagesProps) => {
	const { t } = useTranslation("chat")
	const [isOpen, setIsOpen] = useState(false)
	const title = t("pinned.title")
	const count = messages.length
	const hasPins = count > 0

	const jumpTo = (messageId: string) => {
		setIsOpen(false)
		onJump(messageId)
	}

	return (
		<Popover
			open={isOpen}
			onOpenChange={setIsOpen}
			side="bottom"
			align="end"
			className={className}
		>
			<PopoverTrigger>
				<Button
					data-slot="pinned-messages-trigger"
					size="icon-sm"
					variant="ghost"
					aria-label={hasPins ? t("pinned.counted", { count }) : title}
					className="relative"
				>
					<Icons.Pin />
					{hasPins ? (
						<span
							data-slot="pinned-messages-dot"
							aria-hidden="true"
							className="absolute right-0.5 bottom-0.5 size-1.5 rounded-full bg-primary ring-2 ring-background"
						/>
					) : null}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				aria-label={title}
				className="w-80 overflow-hidden rounded-2xl p-0"
			>
				<p className="border-border border-b px-4 py-3 font-medium text-sm">
					{title}
				</p>
				{hasPins ? (
					<ul className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto">
						{messages.map((message) => (
							<PinnedMessageRow
								key={message.id}
								message={message}
								onJump={() => jumpTo(message.id)}
								onUnpin={() => onUnpin(message.id)}
							/>
						))}
					</ul>
				) : (
					<p className="px-4 py-3 text-muted-foreground text-sm">
						{t("pinned.empty")}
					</p>
				)}
			</PopoverContent>
		</Popover>
	)
}

export {
	PINNED_AVATAR_SIZE,
	type PinnedMessage,
	PinnedMessages,
	type PinnedMessagesProps,
}
