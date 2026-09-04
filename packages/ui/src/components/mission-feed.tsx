import { useTranslation } from "react-i18next"

import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import type { MissionEventModel } from "@workspace/ui/components/mission"
import { toRelativeTime } from "@workspace/ui/lib/relative-time"
import { cn } from "@workspace/ui/lib/utils"

type MissionFeedProps = {
	events: MissionEventModel[]
	now: number
	className?: string
}

type MissionMachineLineProps = {
	event: MissionEventModel
	now: number
}

const MissionMachineLine = ({ event, now }: MissionMachineLineProps) => {
	const { t, i18n } = useTranslation("chat")

	return (
		<p
			className="flex w-full min-w-0 items-center gap-1.5 text-muted-foreground text-xs"
			data-slot="mission-machine-line"
		>
			<span className="max-w-24 shrink truncate font-medium">
				{event.source}
			</span>
			<span className="min-w-0 flex-1 truncate">
				{t(`missions.event.${event.kind}`)}
			</span>
			<time
				className="shrink-0 tabular-nums"
				dateTime={new Date(event.createdAt).toISOString()}
			>
				{toRelativeTime(event.createdAt, i18n.language, now)}
			</time>
		</p>
	)
}

const MissionFeed = ({ events, now, className }: MissionFeedProps) => (
	<ol
		className={cn("flex w-full min-w-0 flex-col gap-2", className)}
		data-slot="mission-feed"
	>
		{events.map((event) => (
			<li className="min-w-0" key={event.id}>
				{event.text === undefined ? (
					<MissionMachineLine event={event} now={now} />
				) : (
					<MessageBubble variant="soft">
						<MessageBubbleContent>{event.text}</MessageBubbleContent>
					</MessageBubble>
				)}
			</li>
		))}
	</ol>
)

export { MissionFeed, type MissionFeedProps }
