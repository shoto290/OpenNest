"use client"

import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"
import { useRosterBot } from "@workspace/ui/components/roster"
import { cn } from "@workspace/ui/lib/utils"

const MENTION_AVATAR_SIZE = 16

const MENTION_CLASS =
	"inline-flex max-w-full items-center gap-1 rounded-full bg-current/10 pr-2 pl-1 align-top font-medium"

const UNKNOWN_CLASS = "pl-2 text-current/70"

const NAME_CLASS = "max-w-40 truncate"

const COUNT_CLASS = "shrink-0 text-current/70 tabular-nums"

type MentionProps = {
	botId: string
	count?: number
	className?: string
}

const Mention = ({ botId, count = 1, className }: MentionProps) => {
	const { t } = useTranslation("chat")
	const bot = useRosterBot(botId)
	const name = bot?.name ?? t("transcript.mention.unknown")
	const isCounted = count > 1

	return (
		<span
			className={cn(MENTION_CLASS, !bot && UNKNOWN_CLASS, className)}
			data-slot="bot-mention"
			data-unknown={bot ? undefined : "true"}
		>
			{bot ? (
				<span aria-hidden="true" className="contents">
					<BotIdentityAvatar
						animal={bot.animal}
						blot={bot.blot}
						image={bot.image}
						name={bot.name}
						seed={bot.id}
						size={MENTION_AVATAR_SIZE}
					/>
				</span>
			) : (
				<Icons.User aria-hidden="true" className="size-3 shrink-0" />
			)}
			<span className={NAME_CLASS} data-slot="bot-mention-name">
				{name}
			</span>
			{isCounted ? (
				<>
					<span
						aria-hidden="true"
						className={COUNT_CLASS}
						data-slot="bot-mention-count"
					>
						{count}
					</span>
					<span className="sr-only">
						{t("transcript.mention.counted", { count })}
					</span>
				</>
			) : null}
		</span>
	)
}

export { Mention, type MentionProps }
