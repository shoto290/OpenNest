import type { ComponentProps } from "react"

import type { BotAvatarBlot } from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type ChatEmptyStateStatus = "ready" | "unavailable"

interface ChatEmptyStateProps extends Omit<ComponentProps<"div">, "children"> {
	status?: ChatEmptyStateStatus
	onSetup?: () => void
	/** The bot this empty conversation belongs to. It titles the screen, so a reader
	 * knows which of their bots they are about to talk to. Without it the screen
	 * falls back to naming the product. */
	name?: string
	/** The animal that bot was given. Drawn as the mark unless it wears a picture. */
	animal?: BotAvatarAnimal
	/** The tint that bot was marked with — what tells its screen from another's. */
	blot?: BotAvatarBlot
	/** The bot's id, which is what the shape of its blot is derived from. */
	seed?: string
	/** The picture that bot wears, if it wears one. It wins over the animal. */
	image?: string
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

/** Larger than the 40 a roster row draws, so the face reads as the ornament of the
 * heading under it rather than as a row that lost its list. */
const MARK_SIZE = 64

function ChatEmptyState({
	status = "ready",
	onSetup,
	name,
	animal,
	blot,
	seed,
	image,
	className,
	...props
}: ChatEmptyStateProps) {
	const { title, description } = CHAT_EMPTY_STATE_COPY[status]
	const isReady = status === "ready"

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
			{isReady ? (
				<BotIdentityAvatar
					animal={animal}
					blot={blot}
					image={image}
					seed={seed}
					size={MARK_SIZE}
				/>
			) : (
				<span className="flex size-12 items-center justify-center rounded-2xl border border-destructive bg-destructive/10 text-destructive">
					<Icons.Alert aria-hidden="true" className="size-6" />
				</span>
			)}

			<div className="flex max-w-md flex-col gap-2">
				<h2 className="font-heading font-medium text-foreground text-lg">
					{isReady && name ? name : title}
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
