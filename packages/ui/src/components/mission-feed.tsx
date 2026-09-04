import { useTranslation } from "react-i18next"

import { BotTitleBadge } from "@workspace/ui/components/badge"
import { MessageHeader } from "@workspace/ui/components/message"
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

type MissionEventProps = {
	event: MissionEventModel
	now: number
}

const MissionEventTime = ({ event, now }: MissionEventProps) => {
	const { i18n } = useTranslation("chat")

	return (
		<time
			className="ms-auto shrink-0 tabular-nums"
			dateTime={new Date(event.createdAt).toISOString()}
		>
			{toRelativeTime(event.createdAt, i18n.language, now)}
		</time>
	)
}

const MissionMachineLine = ({ event, now }: MissionEventProps) => {
	const { t } = useTranslation("chat")

	return (
		<p
			className="flex w-full min-w-0 items-center gap-1.5 text-muted-foreground text-xs"
			data-slot="mission-machine-line"
		>
			<span className="max-w-24 truncate font-medium">{event.source}</span>
			<span className="min-w-0 flex-1 truncate">
				{t(`missions.event.${event.kind}`)}
			</span>
			<MissionEventTime event={event} now={now} />
		</p>
	)
}

const MissionAuthoredEvent = ({ event, now }: MissionEventProps) => {
	const { t } = useTranslation("chat")

	return (
		<div
			className="flex w-full min-w-0 flex-col gap-1"
			data-slot="mission-authored-event"
		>
			<MessageHeader className="min-w-0 flex-wrap">
				<span className="max-w-32 truncate font-medium text-foreground/80">
					{event.source}
				</span>
				<BotTitleBadge
					className="max-w-40"
					title={t(`missions.event.${event.kind}`)}
				/>
				<MissionEventTime event={event} now={now} />
			</MessageHeader>
			<MessageBubble variant="soft">
				<MessageBubbleContent>{event.text}</MessageBubbleContent>
			</MessageBubble>
		</div>
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
					<MissionAuthoredEvent event={event} now={now} />
				)}
			</li>
		))}
	</ol>
)

export { MissionFeed, type MissionFeedProps }
