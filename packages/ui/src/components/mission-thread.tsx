import { useTranslation } from "react-i18next"

import type {
	MissionBot,
	MissionEventModel,
	MissionState,
	MissionTicket,
} from "@workspace/ui/components/mission"
import { MissionFeed } from "@workspace/ui/components/mission-feed"
import { MissionHeader } from "@workspace/ui/components/mission-header"
import { Notice } from "@workspace/ui/components/notice"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"

type MissionThreadProps = {
	bot: MissionBot
	ticket: MissionTicket
	tools: string[]
	state: MissionState
	isClosed: boolean
	events: MissionEventModel[]
	now: number
	hasFailedToRead: boolean
	onRetry: () => void
	onSend: (text: string) => void
	className?: string
}

const MissionThread = ({
	bot,
	ticket,
	tools,
	state,
	isClosed,
	events,
	now,
	hasFailedToRead,
	onRetry,
	onSend,
	className,
}: MissionThreadProps) => {
	const { t } = useTranslation("chat")

	return (
		<ThreadLayout
			className={className}
			composer={
				<PromptInput
					disabled={isClosed}
					onSubmit={onSend}
					placeholder={t("missions.composer.placeholder")}
				/>
			}
			contentClassName="flex min-h-full w-full flex-col px-4 pt-4 pb-2"
			header={
				<MissionHeader bot={bot} state={state} ticket={ticket} tools={tools} />
			}
			label={t("missions.feed.label")}
		>
			{hasFailedToRead ? (
				<Notice
					description={t("missions.failure.read.description")}
					retry={{ onRetry }}
					title={t("missions.failure.read.title")}
				/>
			) : (
				<MissionFeed events={events} now={now} />
			)}
		</ThreadLayout>
	)
}

export { MissionThread, type MissionThreadProps }
