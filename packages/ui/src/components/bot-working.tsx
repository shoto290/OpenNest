"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import { AgentProgress } from "@workspace/ui/components/agents/loading-states/agent-progress"
import { ThinkingShimmer } from "@workspace/ui/components/agents/loading-states/thinking-shimmer"
import type { BotAvatarBlot } from "@workspace/ui/components/bot-avatar"
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
	/** The tint that bot was marked with. It stays behind the animal while it works,
	 * so a bot is the same colour busy as it is at rest. */
	blot?: BotAvatarBlot
	/** The picture that bot wears, if it wears one: it keeps wearing it while it
	 * works, and the activity dot is what says so. */
	image?: string
	/** The working bot's id, which is what its blot's shape is derived from. A bot
	 * must not change shape the moment it starts working. */
	seed?: string
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
	name,
	label,
	animal,
	blot,
	image,
	seed,
	size = CHAT_AVATAR_SIZE,
	className,
}: BotWorkingProps) {
	const { t } = useTranslation("chat")
	const markId = useChatMarkId()
	const [pointed, setPointed] = useState(false)
	const named = name ?? t("working.name")
	const text = label
		? t("working.labelled", { name: named, label })
		: t("working.state", { name: named, verb: t(`working.verb.${kind}`) })
	/** The hidden words answer the pointer too: reaching for them is reaching for
	 * the avatar, so both halves of the row listen. */
	const pointing = {
		onPointerEnter: () => setPointed(true),
		onPointerLeave: () => setPointed(false),
	}

	return (
		<div
			data-slot="bot-working"
			data-kind={kind}
			className={cn("flex min-w-0 items-center gap-2", className)}
		>
			<SharedMark markId={markId} className="shrink-0" {...pointing}>
				<BotIdentityAvatar
					animal={animal}
					blot={blot}
					image={image}
					kind={kind}
					seed={seed}
					size={size}
					working
				/>
			</SharedMark>
			<span
				className={cn(
					"min-w-0 text-muted-foreground text-sm",
					pointed ? "opacity-100" : "opacity-0",
				)}
				{...pointing}
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
