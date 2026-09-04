"use client"

import { useTranslation } from "react-i18next"

import { type BotBadge, BotBadgeDot } from "@workspace/ui/components/badge"
import { toRelativeTime } from "@workspace/ui/lib/relative-time"

type MissionRowModel = {
	id: string
	objective: string
	ticketId: string
	tools: string[]
	openedAt: number
	badge: BotBadge | null
}

type MissionRowProps = MissionRowModel & {
	now: number
	onOpen?: () => void
}

const SEPARATOR_CLASS = "before:mx-1.5 before:content-['·']"

const MissionRow = ({
	id,
	objective,
	ticketId,
	tools,
	openedAt,
	badge,
	now,
	onOpen,
}: MissionRowProps) => {
	const { t, i18n } = useTranslation("chat")

	const identity = (
		<>
			<span className="truncate font-medium text-sm">{objective}</span>
			<span className="truncate text-muted-foreground text-xs tabular-nums">
				<span>{ticketId}</span>
				{tools.length > 0 ? (
					<span className={SEPARATOR_CLASS}>{tools.join(", ")}</span>
				) : null}
				<span className={SEPARATOR_CLASS}>
					{toRelativeTime(openedAt, i18n.language, now)}
				</span>
			</span>
			{badge ? (
				<span className="sr-only">{t(`activity.missions.badge.${badge}`)}</span>
			) : null}
		</>
	)

	return (
		<li
			className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-2.5"
			data-slot="mission-row"
		>
			{onOpen ? (
				<button
					className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
					data-opens={id}
					onClick={onOpen}
					type="button"
				>
					{identity}
				</button>
			) : (
				<div className="flex min-w-0 flex-1 flex-col gap-1">{identity}</div>
			)}
			{badge ? <BotBadgeDot badge={badge} placement="inline" /> : null}
		</li>
	)
}

export { MissionRow, type MissionRowModel, type MissionRowProps }
