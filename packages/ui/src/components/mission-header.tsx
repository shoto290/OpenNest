import { useTranslation } from "react-i18next"

import { Badge } from "@workspace/ui/components/badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"
import {
	MISSION_AVATAR_SIZE,
	type MissionBot,
	type MissionState,
	type MissionTicket,
	missionBadgeFor,
} from "@workspace/ui/components/mission"
import { MissionStatePill } from "@workspace/ui/components/mission-state-pill"
import { cn } from "@workspace/ui/lib/utils"

type MissionHeaderProps = {
	bot: MissionBot
	ticket: MissionTicket
	tools: string[]
	state: MissionState
	className?: string
}

const MissionHeader = ({
	bot,
	ticket,
	tools,
	state,
	className,
}: MissionHeaderProps) => {
	const { t } = useTranslation("chat")

	return (
		<header
			className={cn(
				"flex w-full shrink-0 items-start gap-3 border-border border-b px-4 py-3",
				className,
			)}
			data-slot="mission-header"
		>
			<BotIdentityAvatar
				animal={bot.animal}
				badge={missionBadgeFor(state)}
				blot={bot.blot}
				image={bot.image}
				name={bot.name}
				seed={bot.seed}
				size={MISSION_AVATAR_SIZE}
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
					<span className="min-w-0 wrap-break-word font-medium text-sm">
						{bot.name}
					</span>
					<MissionStatePill state={state} />
				</div>
				<p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-muted-foreground text-xs">
					<span className="shrink-0 font-medium tabular-nums">
						{ticket.externalId}
					</span>
					<span className="min-w-0 wrap-break-word">{ticket.title}</span>
				</p>
				{tools.length > 0 ? (
					<ul
						aria-label={t("missions.header.tools")}
						className="flex min-w-0 flex-wrap items-center gap-1"
					>
						{tools.map((tool) => (
							<li key={tool}>
								<Badge className="max-w-40" variant="outline">
									<Icons.Tool aria-hidden="true" data-icon="inline-start" />
									<span className="truncate">{tool}</span>
								</Badge>
							</li>
						))}
					</ul>
				) : null}
			</div>
		</header>
	)
}

export { MissionHeader, type MissionHeaderProps }
