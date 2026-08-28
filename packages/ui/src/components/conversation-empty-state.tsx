import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"
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
		<div
			className={cn(
				"m-auto flex w-full flex-col items-center gap-5 px-6 py-12 text-center",
				className,
			)}
			data-slot="conversation-empty-state"
			{...props}
		>
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

			<div className="flex max-w-md flex-col gap-2">
				<h2 className="font-heading font-medium text-foreground text-lg">
					{title}
				</h2>
				<p className="text-muted-foreground text-sm">
					{t("conversationEmptyState.description", { count: bots.length })}
				</p>
			</div>

			<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
				{t("conversationEmptyState.hint")}
				<Icons.ArrowDown aria-hidden="true" className="size-3.5" />
			</p>
		</div>
	)
}

export { ConversationEmptyState, type ConversationEmptyStateProps }
