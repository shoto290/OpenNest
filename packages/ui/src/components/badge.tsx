import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentPropsWithRef } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

const badgeVariants = cva(
	"group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-2xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
				secondary:
					"bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
				destructive:
					"bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
				outline:
					"border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
				ghost:
					"hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
				link: "text-primary underline-offset-4 hover:underline",
				dot: "pointer-events-none size-2 gap-0 rounded-full border-0 p-0",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
)

function Badge({
	className,
	variant = "default",
	render,
	...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return useRender({
		defaultTagName: "span",
		props: mergeProps<"span">(
			{
				className: cn(badgeVariants({ variant }), className),
			},
			props,
		),
		render,
		state: {
			slot: "badge",
			variant,
		},
	})
}

const BOT_BADGES = ["attention", "done", "failed"] as const

type BotBadge = (typeof BOT_BADGES)[number]

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
				"group-data-[state=collapsed]/sidebar:absolute group-data-[state=collapsed]/sidebar:top-1 group-data-[state=collapsed]/sidebar:right-1 group-data-[state=collapsed]/sidebar:ring-2 group-data-[state=collapsed]/sidebar:ring-[var(--badge-ring,var(--color-sidebar))]",
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
		className={cn(botBadgeVariants({ badge, placement }), className)}
		data-badge={badge}
		data-slot="bot-badge-dot"
		variant="dot"
		{...props}
	/>
)

const BOT_MISSION_STATES = ["waiting", "failed", "ready", "working"] as const

type BotMissionState = (typeof BOT_MISSION_STATES)[number]

const BOT_MISSION_CHIP =
	"inline-flex h-4 shrink-0 items-center gap-1 rounded-full bg-foreground/10 px-1.5 text-[10px] font-medium text-foreground/80 leading-none tabular-nums"

const botMissionDotVariants = cva("size-1.5 rounded-full", {
	variants: {
		state: {
			waiting: "bg-bot-badge-attention",
			failed: "bg-bot-badge-failed",
			ready: "bg-bot-badge-done",
			working: "bg-muted-foreground/40",
		},
	},
})

type BotMissionChipProps = Omit<ComponentPropsWithRef<"span">, "children"> & {
	state: BotMissionState
	count: number
}

const BotMissionChip = ({
	state,
	count,
	className,
	...props
}: BotMissionChipProps) => {
	const { t } = useTranslation("bots")

	return (
		<span
			aria-label={t("roster.mission.chip", {
				count,
				state: t(`roster.mission.state.${state}`),
			})}
			className={cn(BOT_MISSION_CHIP, className)}
			data-slot="bot-mission-chip"
			data-state={state}
			role="img"
			{...props}
		>
			<span
				aria-hidden="true"
				className={botMissionDotVariants({ state })}
				data-slot="bot-mission-dot"
			/>
			{count > 1 ? count : null}
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
	Badge,
	BOT_BADGES,
	BOT_MISSION_STATES,
	type BotBadge,
	BotBadgeDot,
	type BotBadgeDotProps,
	BotMissionChip,
	type BotMissionChipProps,
	type BotMissionState,
	BotTitleBadge,
	type BotTitleBadgeProps,
	badgeVariants,
	botBadgeRingVariants,
	botBadgeVariants,
}
