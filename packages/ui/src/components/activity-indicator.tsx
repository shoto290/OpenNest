"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import type { BotAvatarBlot } from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import {
	type ActivityIndicatorKind,
	avatarShape,
	BotIdentityAvatar,
} from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"
import { useMarkId } from "@workspace/ui/components/mark-context"
import { SharedMark } from "@workspace/ui/components/motion/shared-mark"
import {
	TextShimmer,
	WORKING_SHIMMER_DURATION,
} from "@workspace/ui/components/motion/text-shimmer"
import { ProgressGrid } from "@workspace/ui/components/progress-grid"
import { TURN_AVATAR_SIZE } from "@workspace/ui/components/turn"
import { cn } from "@workspace/ui/lib/utils"

interface ActivityIndicatorProps {
	kind?: ActivityIndicatorKind
	botId?: string
	name?: string
	label?: string
	animal?: BotAvatarAnimal
	blot?: BotAvatarBlot
	image?: string
	seed?: string
	onStop?: () => void
	size?: number
	className?: string
}

const STOP_OVERLAY =
	"pointer-events-none absolute inset-0 flex items-center justify-center bg-background/75 text-foreground"

const isTimed = (kind: ActivityIndicatorKind) =>
	kind === "searching" || kind === "working"

function ActivityIndicator({
	kind = "thinking",
	botId,
	name,
	label,
	animal,
	blot,
	image,
	seed,
	onStop,
	size = TURN_AVATAR_SIZE,
	className,
}: ActivityIndicatorProps) {
	const { t } = useTranslation("chat")
	const markId = useMarkId(botId)
	const [pointed, setPointed] = useState(false)
	const [armed, setArmed] = useState(false)
	const named = name ?? t("working.name")
	const text = label
		? t("working.labelled", { name: named, label })
		: t("working.state", { name: named, verb: t(`working.verb.${kind}`) })
	const pointing = {
		onPointerEnter: () => setPointed(true),
		onPointerLeave: () => setPointed(false),
	}
	const arming = {
		onPointerEnter: () => setArmed(true),
		onPointerLeave: () => setArmed(false),
		onFocus: () => setArmed(true),
		onBlur: () => setArmed(false),
	}
	const avatar = (
		<BotIdentityAvatar
			animal={animal}
			blot={blot}
			image={image}
			kind={kind}
			name={name}
			seed={seed}
			size={size}
			working
		/>
	)

	return (
		<div
			data-slot="bot-working"
			data-kind={kind}
			className={cn("flex min-w-0 items-center gap-2", className)}
		>
			<SharedMark markId={markId} className="shrink-0" {...pointing}>
				{onStop ? (
					<button
						type="button"
						data-slot="bot-working-stop"
						aria-label={t("working.stop", { name: named })}
						onClick={onStop}
						{...arming}
						className="relative block w-fit rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{avatar}
						<span
							aria-hidden="true"
							data-slot="bot-working-stop-glyph"
							className={cn(
								STOP_OVERLAY,
								avatarShape(image),
								armed ? "opacity-100" : "opacity-0",
							)}
						>
							<Icons.Stop className="size-1/2" />
						</span>
					</button>
				) : (
					avatar
				)}
			</SharedMark>
			<span
				className={cn(
					"min-w-0 text-muted-foreground text-sm",
					pointed ? "opacity-100" : "opacity-0",
				)}
				{...pointing}
			>
				{isTimed(kind) ? (
					<ProgressGrid indicator={null} label={text} running={pointed} />
				) : (
					<TextShimmer
						className="font-medium"
						duration={WORKING_SHIMMER_DURATION}
					>
						{text}
					</TextShimmer>
				)}
			</span>
		</div>
	)
}

export type { ActivityIndicatorKind }
export { ActivityIndicator, type ActivityIndicatorProps }
