import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import {
	MISSION_AVATAR_SIZE,
	type MissionBot,
	type MissionState,
	type MissionTicket,
	missionBadgeFor,
} from "@workspace/ui/components/mission"
import { MissionStatePill } from "@workspace/ui/components/mission-state-pill"
import { cn } from "@workspace/ui/lib/utils"

type MissionCardModel = {
	id: string
	bot: MissionBot
	objective: string
	ticket: MissionTicket
	state: MissionState
	isClosed: boolean
}

type MissionCardProps = MissionCardModel & {
	onOpen: (missionId: string) => void
	className?: string
}

const MissionCard = ({
	id,
	bot,
	objective,
	ticket,
	state,
	isClosed,
	onOpen,
	className,
}: MissionCardProps) => (
	<button
		className={cn(
			"flex w-full max-w-md items-start gap-3 rounded-2xl border border-border p-3 text-start outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30",
			isClosed ? "bg-transparent" : "bg-muted/40",
			className,
		)}
		data-closed={isClosed}
		data-slot="mission-card"
		onClick={() => onOpen(id)}
		type="button"
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
		<span className="flex min-w-0 flex-1 flex-col gap-1">
			<span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
				<span className="min-w-0 wrap-break-word font-medium text-sm">
					{bot.name}
				</span>
				<MissionStatePill state={state} />
			</span>
			<span
				className={cn(
					"wrap-break-word text-sm",
					isClosed && "text-muted-foreground",
				)}
			>
				{objective}
			</span>
			<span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-muted-foreground text-xs">
				<span className="shrink-0 font-medium tabular-nums">
					{ticket.externalId}
				</span>
				<span className="min-w-0 wrap-break-word">{ticket.title}</span>
			</span>
		</span>
	</button>
)

export { MissionCard, type MissionCardModel, type MissionCardProps }
