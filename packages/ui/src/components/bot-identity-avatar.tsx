"use client"

import {
	AvatarFrame,
	UPLOADED_IMAGE_SHAPE,
} from "@workspace/ui/components/avatar"
import { type BotBadge, BotBadgeDot } from "@workspace/ui/components/badge"
import {
	BotAvatar,
	type BotAvatarBlot,
} from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import type { BotAvatarState } from "@workspace/ui/components/bot-avatar-data"
import { drawnAnimal } from "@workspace/ui/components/bot-settings"

const REST_STATE: BotAvatarState = "idle"

type ActivityIndicatorKind = Extract<
	BotAvatarState,
	"thinking" | "searching" | "working" | "writing" | "waiting"
>

const busyStateFor = (kind: ActivityIndicatorKind): BotAvatarState =>
	kind === "waiting" ? "listening" : kind

const avatarShape = (image?: string) => (image ? UPLOADED_IMAGE_SHAPE : "")

const IMAGE_BORDER_CLASS = "border border-border"

const DEFAULT_SIZE = 40

type BotIdentityAvatarProps = {
	name?: string
	animal?: BotAvatarAnimal
	blot?: BotAvatarBlot
	seed?: string
	image?: string
	badge?: BotBadge
	working?: boolean
	kind?: ActivityIndicatorKind
	size?: number
	className?: string
}

function BotIdentityAvatar({
	name,
	animal,
	blot,
	seed,
	image,
	badge,
	working = false,
	kind = "thinking",
	size = DEFAULT_SIZE,
	className,
}: BotIdentityAvatarProps) {
	return (
		<AvatarFrame
			className={className}
			image={image}
			imageClassName={IMAGE_BORDER_CLASS}
			overlay={
				badge ? (
					<BotBadgeDot
						badge={badge}
						data-slot="bot-activity-dot"
						placement="avatar"
					/>
				) : null
			}
			size={size}
			slot="bot-identity-avatar"
		>
			<BotAvatar
				animal={drawnAnimal(name, animal)}
				animated={working}
				blot={blot}
				className="block size-full"
				seed={seed}
				size={size}
				state={working ? busyStateFor(kind) : REST_STATE}
			/>
		</AvatarFrame>
	)
}

export {
	type ActivityIndicatorKind,
	avatarShape,
	BotIdentityAvatar,
	type BotIdentityAvatarProps,
}
