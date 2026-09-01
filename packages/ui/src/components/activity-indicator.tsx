"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import type { BotAvatarBlot } from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import {
	type ActivityIndicatorKind,
	BotIdentityAvatar,
	BotStopButton,
	type BotStopProps,
} from "@workspace/ui/components/bot-identity-avatar"
import { useMarkId } from "@workspace/ui/components/mark-context"
import { SharedMark } from "@workspace/ui/components/motion/shared-mark"
import {
	TextShimmer,
	WORKING_SHIMMER_DURATION,
} from "@workspace/ui/components/motion/text-shimmer"
import { ProgressGrid } from "@workspace/ui/components/progress-grid"
import { TURN_AVATAR_SIZE } from "@workspace/ui/components/turn"
import { cn } from "@workspace/ui/lib/utils"

type ActivityIndicatorProps = BotStopProps & {
	kind?: ActivityIndicatorKind
	botId?: string
	name?: string
	label?: string
	animal?: BotAvatarAnimal
	blot?: BotAvatarBlot
	image?: string
	seed?: string
	size?: number
	className?: string
}

const isTimed = (kind: ActivityIndicatorKind) =>
	kind === "searching" || kind === "working"

function ActivityIndicator(props: ActivityIndicatorProps) {
	const {
		kind = "thinking",
		botId,
		name,
		label,
		animal,
		blot,
		image,
		seed,
		size = TURN_AVATAR_SIZE,
		className,
	} = props
	const { t } = useTranslation("chat")
	const markId = useMarkId(botId)
	const [pointed, setPointed] = useState(false)
	const named = name ?? t("working.name")
	const text = label
		? t("working.labelled", { name: named, label })
		: t("working.state", { name: named, verb: t(`working.verb.${kind}`) })
	const pointing = {
		onPointerEnter: () => setPointed(true),
		onPointerLeave: () => setPointed(false),
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
				{props.stoppable ? (
					<BotStopButton image={image} name={named} onStop={props.onStop}>
						{avatar}
					</BotStopButton>
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
