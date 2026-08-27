"use client"

import { type BotBadge, BotBadgeDot } from "@workspace/ui/components/badge"
import {
	BotIdentityAvatar,
	type BotIdentityAvatarProps,
} from "@workspace/ui/components/bot-identity-avatar"

const DEFAULT_SIZE = 40

const CONVERSATION_AVATAR_LIMIT = 3

const HELD_GAP = 2

const FRAME_INSET_RATIO = 0.125

const FRAME =
	"relative grid shrink-0 place-content-center rounded-[28%] border border-border bg-muted"

type ConversationParticipant = Pick<
	BotIdentityAvatarProps,
	"name" | "animal" | "blot" | "image" | "working" | "kind"
> & { id: string }

type ConversationAvatarProps = {
	participants: ConversationParticipant[]
	size?: number
	badge?: BotBadge
}

function ConversationAvatar({
	participants,
	size = DEFAULT_SIZE,
	badge,
}: ConversationAvatarProps) {
	const held = participants.slice(0, CONVERSATION_AVATAR_LIMIT)
	const inner = size - Math.round(size * FRAME_INSET_RATIO) * 2
	const isStacked = held.length > 1
	const tile = isStacked ? (inner - HELD_GAP) / 2 : inner

	return (
		<span
			aria-hidden="true"
			className={FRAME}
			data-slot="conversation-avatar"
			style={{
				width: size,
				height: size,
				gap: HELD_GAP,
				gridTemplateColumns: `repeat(${isStacked ? 2 : 1}, auto)`,
			}}
		>
			{held.map((participant) => (
				<BotIdentityAvatar
					animal={participant.animal}
					blot={participant.blot}
					image={participant.image}
					key={participant.id}
					kind={participant.kind}
					name={participant.name}
					seed={participant.id}
					size={tile}
					working={participant.working}
				/>
			))}
			{badge ? (
				<BotBadgeDot
					badge={badge}
					data-slot="bot-activity-dot"
					placement="avatar"
				/>
			) : null}
		</span>
	)
}

export {
	CONVERSATION_AVATAR_LIMIT,
	ConversationAvatar,
	type ConversationAvatarProps,
	type ConversationParticipant,
}
