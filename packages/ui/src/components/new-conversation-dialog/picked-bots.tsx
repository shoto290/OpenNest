"use client"

import { useTranslation } from "react-i18next"

import { Badge } from "@workspace/ui/components/badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import type { ConversationBot } from "@workspace/ui/components/conversation-bots"
import { Icons } from "@workspace/ui/components/icons"

const CHIP_AVATAR_SIZE = 20

const CHIP_CLASS = "h-7 gap-1.5 rounded-full py-0 pr-1 pl-1"

const DISMISS_CLASS =
	"grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors duration-100 ease-out hover:bg-foreground/10 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 motion-reduce:transition-none"

type PickedBotsProps = {
	bots: ConversationBot[]
	onDismiss: (id: string) => void
}

const PickedBots = ({ bots, onDismiss }: PickedBotsProps) => {
	const { t } = useTranslation("chat")

	if (bots.length === 0) {
		return null
	}

	return (
		<ul className="flex flex-wrap gap-1.5" data-slot="picked-bots">
			{bots.map((bot, index) => (
				<li key={bot.id}>
					<Badge
						className={CHIP_CLASS}
						data-slot="picked-bot"
						variant="outline"
					>
						<span aria-hidden="true" className="contents">
							<BotIdentityAvatar
								animal={bot.animal}
								blot={bot.blot}
								image={bot.image}
								name={bot.name}
								seed={bot.id}
								size={CHIP_AVATAR_SIZE}
							/>
						</span>
						{index === 0 ? (
							<>
								<Icons.Crown
									aria-hidden="true"
									className="shrink-0 text-bot-badge-attention"
									data-slot="picked-bot-lead"
								/>
								<span className="sr-only">
									{t("newConversation.picked.lead")}
								</span>
							</>
						) : null}
						<span className="max-w-40 truncate">{bot.name}</span>
						<button
							aria-label={t("newConversation.picked.dismiss", {
								name: bot.name,
							})}
							className={DISMISS_CLASS}
							onClick={() => onDismiss(bot.id)}
							type="button"
						>
							<Icons.Close aria-hidden="true" className="size-3" />
						</button>
					</Badge>
				</li>
			))}
		</ul>
	)
}

export { PickedBots, type PickedBotsProps }
