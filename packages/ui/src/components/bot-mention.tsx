"use client"

import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { useConversationBot } from "@workspace/ui/components/conversation-bots"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

const MENTION_AVATAR_SIZE = 16

const MENTION_CLASS =
	"-my-0.5 inline-flex max-w-full items-center gap-1 rounded-full bg-current/10 py-0.5 pr-2 pl-1 align-middle font-medium"

const UNKNOWN_CLASS = "pl-2 text-current/70"

type BotMentionProps = {
	botId: string
	className?: string
}

const BotMention = ({ botId, className }: BotMentionProps) => {
	const { t } = useTranslation("chat")
	const bot = useConversationBot(botId)

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
			<span className="max-w-40 truncate">
				{bot?.name ?? t("transcript.mention.unknown")}
			</span>
		</span>
	)
}

export { BotMention, type BotMentionProps }
