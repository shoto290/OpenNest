"use client"

import { type BotBadge, BotBadgeDot } from "@workspace/ui/components/badge"
import {
	BotAvatar,
	type BotAvatarBlot,
} from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import type { BotAvatarState } from "@workspace/ui/components/bot-avatar-data"
import { drawnAnimal } from "@workspace/ui/components/bot-settings"
import { cn } from "@workspace/ui/lib/utils"

const REST_STATE: BotAvatarState = "idle"

type ActivityIndicatorKind = Extract<
	BotAvatarState,
	"thinking" | "searching" | "working" | "writing" | "waiting"
>

const busyStateFor = (kind: ActivityIndicatorKind): BotAvatarState =>
	kind === "waiting" ? "listening" : kind

const UPLOADED_IMAGE_SHAPE = "rounded-full"

const avatarShape = (image?: string) => (image ? UPLOADED_IMAGE_SHAPE : "")

const IMAGE_CLASS = `size-full border border-border object-cover ${UPLOADED_IMAGE_SHAPE}`

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
		<span
			className={cn("relative block shrink-0", className)}
			data-slot="bot-identity-avatar"
			style={{ width: size, height: size }}
		>
			{image ? (
				<img alt="" aria-hidden="true" className={IMAGE_CLASS} src={image} />
			) : (
				<BotAvatar
					animal={drawnAnimal(name, animal)}
					animated={working}
					blot={blot}
					className="block size-full"
					seed={seed}
					size={size}
					state={working ? busyStateFor(kind) : REST_STATE}
				/>
			)}
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
	type ActivityIndicatorKind,
	avatarShape,
	BotIdentityAvatar,
	type BotIdentityAvatarProps,
}
