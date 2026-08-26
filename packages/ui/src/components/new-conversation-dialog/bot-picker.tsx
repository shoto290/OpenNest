"use client"

import { useTranslation } from "react-i18next"

import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import type { BotAvatarBlot } from "@workspace/ui/components/bot-settings"
import { Icons } from "@workspace/ui/components/icons"
import { SettingsField } from "@workspace/ui/components/settings-field"

const ROW_AVATAR_SIZE = 28

const ROW_CLASS =
	"flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-foreground text-sm outline-none transition-colors duration-100 ease-out hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 aria-pressed:bg-muted motion-reduce:transition-none"

type ConversationBot = {
	id: string
	name: string
	animal?: BotAvatarAnimal
	blot?: BotAvatarBlot
	image?: string
}

type BotPickerProps = {
	bots: ConversationBot[]
	pickedIds: string[]
	onPick: (id: string) => void
	search: string
	onSearchChange: (search: string) => void
}

const matching = (bots: ConversationBot[], search: string) => {
	const needle = search.trim().toLowerCase()
	return needle
		? bots.filter((bot) => bot.name.toLowerCase().includes(needle))
		: bots
}

const BotPicker = ({
	bots,
	pickedIds,
	onPick,
	search,
	onSearchChange,
}: BotPickerProps) => {
	const { t } = useTranslation("chat")
	const matches = matching(bots, search)

	return (
		<div className="flex min-h-0 flex-col gap-2" data-slot="bot-picker">
			<SettingsField
				icon={Icons.Search}
				label={t("newConversation.search.label")}
				onValueChange={onSearchChange}
				placeholder={t("newConversation.search.placeholder")}
				value={search}
			/>

			{matches.length === 0 ? (
				<p
					className="py-8 text-center text-muted-foreground text-sm"
					data-slot="bot-picker-empty"
				>
					{t("newConversation.empty")}
				</p>
			) : (
				<ul className="-mx-2 flex max-h-56 flex-col gap-1 overflow-y-auto px-2">
					{matches.map((bot) => {
						const isPicked = pickedIds.includes(bot.id)

						return (
							<li key={bot.id}>
								<button
									aria-pressed={isPicked}
									className={ROW_CLASS}
									data-slot="bot-picker-row"
									onClick={() => onPick(bot.id)}
									type="button"
								>
									<span aria-hidden="true" className="contents">
										<BotIdentityAvatar
											animal={bot.animal}
											blot={bot.blot}
											image={bot.image}
											name={bot.name}
											seed={bot.id}
											size={ROW_AVATAR_SIZE}
										/>
									</span>
									<span className="min-w-0 flex-1 truncate">{bot.name}</span>
									{isPicked ? (
										<Icons.Check
											aria-hidden="true"
											className="size-4 shrink-0 text-muted-foreground"
										/>
									) : null}
								</button>
							</li>
						)
					})}
				</ul>
			)}
		</div>
	)
}

export { BotPicker, type BotPickerProps, type ConversationBot }
