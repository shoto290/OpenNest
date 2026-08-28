import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { EmptyStateShell } from "@workspace/ui/components/empty-state-shell"
import type { RosterBot } from "@workspace/ui/components/roster"
import { cn } from "@workspace/ui/lib/utils"

type ConversationEmptyStateProps = Omit<
	ComponentProps<"div">,
	"children" | "title"
> & {
	title: string
	bots: RosterBot[]
}

const MARK_SIZE = 56

const ConversationEmptyState = ({
	title,
	bots,
	className,
	...props
}: ConversationEmptyStateProps) => {
	const { t } = useTranslation("chat")

	return (
		<EmptyStateShell
			className={cn("m-auto", className)}
			data-slot="conversation-empty-state"
			description={t("conversationEmptyState.description", {
				count: bots.length,
			})}
			hint={t("conversationEmptyState.hint")}
			mark={
				<div className="flex flex-wrap items-center justify-center gap-2">
					{bots.map((bot) => (
						<BotIdentityAvatar
							animal={bot.animal}
							blot={bot.blot}
							image={bot.image}
							key={bot.id}
							name={bot.name}
							seed={bot.id}
							size={MARK_SIZE}
						/>
					))}
				</div>
			}
			title={title}
			{...props}
		/>
	)
}

export { ConversationEmptyState, type ConversationEmptyStateProps }
