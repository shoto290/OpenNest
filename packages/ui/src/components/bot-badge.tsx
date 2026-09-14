"use client"

import type { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentPropsWithRef } from "react"
import { useTranslation } from "react-i18next"

import { missionTicketPlatform } from "@workspace/ui/components/mission-marks"
import { Badge } from "@workspace/ui/components/ui/badge"
import { cn } from "@workspace/ui/lib/utils"

const BOT_BADGES = ["attention", "done", "failed"] as const

type BotBadge = (typeof BOT_BADGES)[number]

const DOT_CLASS = "pointer-events-none size-2 gap-0 rounded-full border-0 p-0"

const botBadgeVariants = cva("", {
	variants: {
		badge: {
			attention: "bg-bot-badge-attention motion-safe:animate-pulse",
			done: "bg-bot-badge-done",
			failed: "bg-bot-badge-failed",
		},
		placement: {
			inline: "",
			avatar:
				"absolute right-[6%] bottom-[6%] size-[34%] max-h-4 max-w-4 ring-2 ring-[var(--badge-ring,var(--color-sidebar))]",
			switcher:
				"group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:ring-2 group-data-[collapsible=icon]:ring-[var(--badge-ring,var(--color-sidebar))]",
			row: "absolute end-0 bottom-1",
		},
	},
})

const botBadgeRingVariants = cva("ring-2", {
	variants: {
		badge: {
			attention: "ring-bot-badge-attention motion-safe:animate-pulse",
			done: "ring-bot-badge-done",
			failed: "ring-bot-badge-failed",
		},
	},
})

type BotBadgeDotProps = useRender.ComponentProps<"span"> &
	Required<Pick<VariantProps<typeof botBadgeVariants>, "badge" | "placement">>

const BotBadgeDot = ({
	badge,
	placement,
	className,
	...props
}: BotBadgeDotProps) => (
	<Badge
		aria-hidden="true"
		className={cn(DOT_CLASS, botBadgeVariants({ badge, placement }), className)}
		data-badge={badge}
		data-slot="bot-badge-dot"
		{...props}
	/>
)

const BOT_MISSION_STATES = ["waiting", "failed", "ready", "working"] as const

type BotMissionState = (typeof BOT_MISSION_STATES)[number]

const BOT_MISSION_STRIP =
	"flex h-6 items-center gap-1.5 rounded-sm bg-foreground/10 px-2 py-1 text-xs"

const botMissionDotVariants = cva("size-1.5 shrink-0 rounded-full", {
	variants: {
		state: {
			waiting: "bg-bot-badge-attention",
			failed: "bg-bot-badge-failed",
			ready: "bg-bot-badge-done",
			working: "bg-muted-foreground/40",
		},
	},
})

type BotMissionTicket = {
	platform: string
	externalId: string
	title: string
}

type BotMissionStripProps = Omit<ComponentPropsWithRef<"span">, "children"> & {
	state: BotMissionState
	ticket: BotMissionTicket
	objective?: string
}

const BotMissionStrip = ({
	state,
	ticket,
	objective,
	className,
	...props
}: BotMissionStripProps) => {
	const { t } = useTranslation("bots")
	const { Mark, isNamed } = missionTicketPlatform(ticket.platform)

	return (
		<span
			className={cn(BOT_MISSION_STRIP, className)}
			data-slot="bot-mission-strip"
			data-state={state}
			{...props}
		>
			<span
				aria-hidden="true"
				className={botMissionDotVariants({ state })}
				data-slot="bot-mission-dot"
			/>
			<span className="sr-only">{t(`roster.mission.state.${state}`)}</span>
			<Mark
				aria-hidden="true"
				className="size-3 shrink-0 text-muted-foreground"
				data-slot="bot-mission-mark"
			/>
			{isNamed ? (
				<span className="shrink-0 font-medium text-foreground/70 tabular-nums">
					{ticket.externalId}
				</span>
			) : null}
			<span
				className="min-w-0 truncate text-muted-foreground"
				data-slot="bot-mission-ticket-title"
			>
				{ticket.title || objective}
			</span>
		</span>
	)
}

const BOT_TITLE_BADGE =
	"shrink-0 truncate rounded-full bg-foreground/10 px-1.5 py-0.5 font-medium text-[10px] text-foreground/80 leading-none"

type BotTitleBadgeProps = Omit<ComponentPropsWithRef<"span">, "title"> & {
	title?: string
}

const BotTitleBadge = ({ title, className, ...props }: BotTitleBadgeProps) =>
	title ? (
		<span
			data-slot="bot-title-badge"
			className={cn(BOT_TITLE_BADGE, className)}
			{...props}
		>
			{title}
		</span>
	) : null

export {
	BOT_BADGES,
	BOT_MISSION_STATES,
	type BotBadge,
	BotBadgeDot,
	type BotBadgeDotProps,
	type BotMissionState,
	BotMissionStrip,
	type BotMissionStripProps,
	type BotMissionTicket,
	BotTitleBadge,
	type BotTitleBadgeProps,
	botBadgeRingVariants,
	botBadgeVariants,
	botMissionDotVariants,
}
