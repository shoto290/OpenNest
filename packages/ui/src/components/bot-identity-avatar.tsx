"use client"

import {
	BotAvatar,
	type BotAvatarBlot,
} from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import type { BotAvatarState } from "@workspace/ui/components/bot-avatar-data"
import { drawnAnimal } from "@workspace/ui/components/bot-settings"
import { cn } from "@workspace/ui/lib/utils"

const REST_STATE: BotAvatarState = "idle"

type BotWorkingKind = Extract<
	BotAvatarState,
	"thinking" | "searching" | "working" | "writing" | "waiting"
>

const busyStateFor = (kind: BotWorkingKind): BotAvatarState =>
	kind === "waiting" ? "listening" : kind

const UPLOADED_IMAGE_SHAPE = "rounded-full"

const avatarShape = (image?: string) => (image ? UPLOADED_IMAGE_SHAPE : "")

const IMAGE_CLASS = `size-full border border-border object-cover ${UPLOADED_IMAGE_SHAPE}`

const DOT_CLASS =
	"absolute right-[6%] bottom-[6%] block rounded-full bg-sidebar-primary ring-2 ring-sidebar motion-safe:animate-pulse"

const DEFAULT_SIZE = 40

const DOT_RATIO = 0.25
const DOT_MAX = 12

const dotSize = (size: number) =>
	Math.round(Math.min(size * DOT_RATIO, DOT_MAX))

type BotIdentityAvatarProps = {
	name?: string
	animal?: BotAvatarAnimal
	blot?: BotAvatarBlot
	seed?: string
	image?: string
	working?: boolean
	kind?: BotWorkingKind
	size?: number
	className?: string
}

function BotIdentityAvatar({
	name,
	animal,
	blot,
	seed,
	image,
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
					className="block"
					seed={seed}
					size={size}
					state={working ? busyStateFor(kind) : REST_STATE}
				/>
			)}
			{working ? (
				<span
					aria-hidden="true"
					className={DOT_CLASS}
					data-slot="bot-activity-dot"
					style={{ width: dotSize(size), height: dotSize(size) }}
				/>
			) : null}
		</span>
	)
}

export {
	avatarShape,
	BotIdentityAvatar,
	type BotIdentityAvatarProps,
	type BotWorkingKind,
}
