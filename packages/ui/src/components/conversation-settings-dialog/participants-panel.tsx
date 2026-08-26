"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Button } from "@workspace/ui/components/button"
import type { ConversationBot } from "@workspace/ui/components/conversation-bots"
import { Icons } from "@workspace/ui/components/icons"
import { BotPicker } from "@workspace/ui/components/new-conversation-dialog/bot-picker"
import {
	FIELD_LABEL_CLASS,
	SETTINGS_TAG_CLASS,
} from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

const ROW_AVATAR_SIZE = 28

const NONE_PICKED: string[] = []

const ROW_CLASS =
	"flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-foreground text-sm transition-colors duration-100 ease-out hover:bg-muted motion-reduce:transition-none"

type ParticipantRowProps = {
	bot: ConversationBot
	isLead: boolean
	isAlone: boolean
	onLeadChange: (id: string) => void
	onDismiss: (id: string) => void
}

const ParticipantRow = ({
	bot,
	isLead,
	isAlone,
	onLeadChange,
	onDismiss,
}: ParticipantRowProps) => {
	const { t } = useTranslation("chat")

	return (
		<li className={ROW_CLASS} data-slot="participant">
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

			{isLead ? (
				<span
					className={cn(SETTINGS_TAG_CLASS, "flex items-center gap-1")}
					data-slot="participant-lead"
				>
					<Icons.Crown
						aria-hidden="true"
						className="size-3 text-bot-badge-attention"
					/>
					{t("conversationSettings.participants.lead")}
				</span>
			) : (
				<Button
					aria-label={t("conversationSettings.participants.promote", {
						name: bot.name,
					})}
					onClick={() => onLeadChange(bot.id)}
					size="icon-sm"
					variant="ghost"
				>
					<Icons.Crown aria-hidden="true" className="size-3.5" />
				</Button>
			)}

			<Button
				aria-label={t("conversationSettings.participants.dismiss", {
					name: bot.name,
				})}
				disabled={isAlone}
				onClick={() => onDismiss(bot.id)}
				size="icon-sm"
				variant="ghost"
			>
				<Icons.Close aria-hidden="true" className="size-3.5" />
			</Button>
		</li>
	)
}

type ParticipantsPanelProps = {
	participants: ConversationBot[]
	leadId: string
	bots: ConversationBot[]
	onLeadChange: (id: string) => void
	onDismiss: (id: string) => void
	onRecruit: (id: string) => void
}

const ParticipantsPanel = ({
	participants,
	leadId,
	bots,
	onLeadChange,
	onDismiss,
	onRecruit,
}: ParticipantsPanelProps) => {
	const { t } = useTranslation("chat")
	const [search, setSearch] = useState("")
	const seatedIds = participants.map((bot) => bot.id)
	const offered = bots.filter((bot) => !seatedIds.includes(bot.id))
	const isAlone = participants.length === 1

	return (
		<div className="flex min-h-0 flex-col gap-4" data-slot="participants-panel">
			<div className="flex flex-col gap-1.5">
				<span className={FIELD_LABEL_CLASS}>
					{t("conversationSettings.participants.label")}
				</span>
				<ul className="-mx-2 flex flex-col">
					{participants.map((bot) => (
						<ParticipantRow
							bot={bot}
							isAlone={isAlone}
							isLead={bot.id === leadId}
							key={bot.id}
							onDismiss={onDismiss}
							onLeadChange={onLeadChange}
						/>
					))}
				</ul>
				{isAlone ? (
					<p
						className="text-muted-foreground text-xs"
						data-slot="participants-last"
					>
						{t("conversationSettings.participants.last")}
					</p>
				) : null}
			</div>

			{offered.length === 0 ? (
				<p
					className="py-8 text-center text-muted-foreground text-sm"
					data-slot="participants-all-seated"
				>
					{t("conversationSettings.participants.all")}
				</p>
			) : (
				<BotPicker
					bots={offered}
					onPick={onRecruit}
					onSearchChange={setSearch}
					pickedIds={NONE_PICKED}
					search={search}
				/>
			)}
		</div>
	)
}

export { ParticipantsPanel, type ParticipantsPanelProps }
