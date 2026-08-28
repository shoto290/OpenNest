"use client"

import { useTranslation } from "react-i18next"

import { type BotBadge, BotBadgeDot } from "@workspace/ui/components/badge"
import {
	BotIdentityAvatar,
	type BotIdentityAvatarProps,
} from "@workspace/ui/components/bot-identity-avatar"

const DEFAULT_SIZE = 40

const AVATAR_GROUP_LIMIT = 3

const HELD_GAP = 2

const FRAME_INSET_RATIO = 0.125

const CORNER = "rounded-[28%]"

const FRAME = `relative grid shrink-0 place-content-center border border-border bg-muted ${CORNER}`

const OVERFLOW_CELL = `grid place-content-center bg-foreground/10 font-medium text-foreground leading-none tabular-nums ${CORNER}`

const OVERFLOW_FONT_RATIO = 0.5

type ConversationParticipant = Pick<
	BotIdentityAvatarProps,
	"name" | "animal" | "blot" | "image" | "working" | "kind"
> & { id: string }

type AvatarGroupProps = {
	participants: ConversationParticipant[]
	size?: number
	badge?: BotBadge
}

function AvatarGroup({
	participants,
	size = DEFAULT_SIZE,
	badge,
}: AvatarGroupProps) {
	const { t } = useTranslation("bots")
	const held = participants.slice(0, AVATAR_GROUP_LIMIT)
	const inner = size - Math.round(size * FRAME_INSET_RATIO) * 2
	const isStacked = held.length > 1
	const tile = isStacked ? (inner - HELD_GAP) / 2 : inner
	const leftOut = participants.length - held.length
	const overflow =
		leftOut > 0 ? t("roster.conversation.others", { count: leftOut }) : null

	return (
		<span
			aria-hidden={overflow ? undefined : "true"}
			aria-label={overflow ?? undefined}
			className={FRAME}
			data-slot="conversation-avatar"
			role="img"
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
			{overflow ? (
				<span
					className={OVERFLOW_CELL}
					data-slot="conversation-avatar-overflow"
					style={{
						width: tile,
						height: tile,
						fontSize: Math.round(tile * OVERFLOW_FONT_RATIO),
					}}
				>
					{overflow}
				</span>
			) : null}
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
	AVATAR_GROUP_LIMIT,
	AvatarGroup,
	type AvatarGroupProps,
	type ConversationParticipant,
}
