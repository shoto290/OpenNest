"use client"

import { useState } from "react"

import { AgentProgress } from "@workspace/ui/components/agents/loading-states/agent-progress"
import { ThinkingShimmer } from "@workspace/ui/components/agents/loading-states/thinking-shimmer"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import {
	BotIdentityAvatar,
	type BotWorkingKind,
} from "@workspace/ui/components/bot-identity-avatar"
import { useChatMarkId } from "@workspace/ui/components/chat-mark-context"
import { CHAT_AVATAR_SIZE } from "@workspace/ui/components/chat-turn"
import { SharedMark } from "@workspace/ui/components/motion/shared-mark"
import { cn } from "@workspace/ui/lib/utils"

interface BotWorkingProps {
	kind?: BotWorkingKind
	/** Name the hover text puts in front of the verb. */
	name?: string
	/** What it is working on right now, e.g. the running tool. Replaces the verb. */
	label?: string
	/** The working bot's own animal. Leave it out and the avatar draws the one it
	 * defaults to, which is a different bot than the one doing the work. */
	animal?: BotAvatarAnimal
	/** The picture that bot wears, if it wears one: it keeps wearing it while it
	 * works, and the activity dot is what says so. */
	image?: string
	size?: number
	className?: string
}

/** Work that runs long enough for the reader to want a clock on it. */
const isTimed = (kind: BotWorkingKind) =>
	kind === "searching" || kind === "working"

/** The avatar is the whole signal; the words only answer a reader who points at
 * it. They stay in the DOM either way, so assistive tech never loses them. */
function BotWorking({
	kind = "thinking",
	name = "No name",
	label,
	animal,
	image,
	size = CHAT_AVATAR_SIZE,
	className,
}: BotWorkingProps) {
	const markId = useChatMarkId()
	const [pointed, setPointed] = useState(false)
	const verb = kind === "waiting" ? "waiting for you" : kind
	const text = label ? `${name} · ${label}` : `${name} is ${verb}…`

	return (
		<div
			data-slot="bot-working"
			data-kind={kind}
			className={cn("flex min-w-0 items-center gap-2", className)}
		>
			<SharedMark
				markId={markId}
				className="shrink-0"
				onPointerEnter={() => setPointed(true)}
				onPointerLeave={() => setPointed(false)}
			>
				<BotIdentityAvatar
					animal={animal}
					image={image}
					kind={kind}
					size={size}
					working
				/>
			</SharedMark>
			<span
				className={cn(
					"min-w-0 text-muted-foreground text-sm transition-opacity duration-200",
					pointed ? "opacity-100" : "opacity-0",
				)}
			>
				{isTimed(kind) ? (
					// The clock only ticks while it is being read.
					<AgentProgress indicator={null} label={text} running={pointed} />
				) : (
					<ThinkingShimmer>{text}</ThinkingShimmer>
				)}
			</span>
		</div>
	)
}

/** Re-exported where it has always been imported from: the vocabulary belongs to the
 * avatar that draws it, and every caller of this row already reads it here. */
export type { BotWorkingKind }
export { BotWorking, type BotWorkingProps }
