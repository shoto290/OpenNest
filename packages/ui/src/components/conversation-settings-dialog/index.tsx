"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { DangerZone } from "@workspace/ui/components/bot-settings-dialog/danger-zone"
import { ParticipantsPanel } from "@workspace/ui/components/conversation-settings-dialog/participants-panel"
import { Content, Root, Title } from "@workspace/ui/components/dialog"
import { Icons } from "@workspace/ui/components/icons"
import type { RosterBot } from "@workspace/ui/components/roster"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	DANGER_RAIL_ITEM_CLASS,
	RAIL_LABELS_MIN_WIDTH,
	SETTINGS_PANEL_CLASS,
	SETTINGS_SCROLLING_PANEL_CLASS,
	SettingsRail,
	SettingsRailItem,
	SettingsRailSeparator,
} from "@workspace/ui/components/settings-rail"
import { SETTINGS_HEADER_CLASS } from "@workspace/ui/components/settings-styles"
import { useIsNarrowerThan } from "@workspace/ui/hooks/use-is-narrower-than"
import { cn } from "@workspace/ui/lib/utils"

const FIRST_TAB = "general"

const DANGER_TAB = "danger"

type ConversationSettingsValue = {
	name: string
	instructions: string
}

type ConversationSettingsDialogProps = {
	open: boolean
	onClose: () => void
	value: ConversationSettingsValue
	onValueChange: (value: ConversationSettingsValue) => void
	participants: RosterBot[]
	leadId: string
	bots: RosterBot[]
	onLeadChange: (id: string) => void
	onDismiss: (id: string) => void
	onRecruit: (id: string) => void
	onDelete: () => void
	className?: string
}

const ConversationSettingsDialog = ({
	open,
	onClose,
	value,
	onValueChange,
	participants,
	leadId,
	bots,
	onLeadChange,
	onDismiss,
	onRecruit,
	onDelete,
	className,
}: ConversationSettingsDialogProps) => {
	const { t } = useTranslation("chat")
	const [tabs, setTabs] = useState<HTMLDivElement | null>(null)
	const iconsOnly = useIsNarrowerThan(tabs, RAIL_LABELS_MIN_WIDTH)
	const conversationName =
		value.name.trim() || t("conversationSettings.untitled")

	const patch = (fields: Partial<ConversationSettingsValue>) =>
		onValueChange({ ...value, ...fields })

	return (
		<Root onOpenChange={(next) => !next && onClose()} open={open}>
			<Content
				className={cn(
					"h-[34rem] w-[52rem] gap-0 overflow-hidden p-0",
					className,
				)}
			>
				<header className={SETTINGS_HEADER_CLASS}>
					<Icons.Message
						aria-hidden="true"
						className="size-5 shrink-0 text-muted-foreground"
					/>
					<Title className="flex min-w-0 items-center gap-1.5 pr-0">
						<span className="truncate">{conversationName}</span>
						<Icons.Next
							aria-hidden="true"
							className="size-3.5 shrink-0 text-muted-foreground"
						/>
						<span className="shrink-0 text-muted-foreground">
							{t("conversationSettings.breadcrumb")}
						</span>
					</Title>
				</header>

				<Tabs.Root
					className="flex min-h-0 flex-1"
					defaultValue={FIRST_TAB}
					orientation="vertical"
					ref={setTabs}
				>
					<SettingsRail iconsOnly={iconsOnly}>
						<SettingsRailItem
							icon={Icons.Settings}
							iconsOnly={iconsOnly}
							label={t("conversationSettings.tab.general")}
							value={FIRST_TAB}
						/>
						<SettingsRailItem
							icon={Icons.User}
							iconsOnly={iconsOnly}
							label={t("conversationSettings.tab.participants")}
							value="participants"
						/>
						<SettingsRailItem
							icon={Icons.Docs}
							iconsOnly={iconsOnly}
							label={t("conversationSettings.tab.instructions")}
							value="instructions"
						/>
						<SettingsRailSeparator />
						<SettingsRailItem
							className={DANGER_RAIL_ITEM_CLASS}
							icon={Icons.Alert}
							iconsOnly={iconsOnly}
							label={t("conversationSettings.tab.danger")}
							value={DANGER_TAB}
						/>
					</SettingsRail>

					<Tabs.Panel
						className={SETTINGS_SCROLLING_PANEL_CLASS}
						value={FIRST_TAB}
					>
						<SettingsField
							label={t("conversationSettings.name.label")}
							onValueChange={(name) => patch({ name })}
							placeholder={t("conversationSettings.name.placeholder")}
							value={value.name}
						/>
					</Tabs.Panel>

					<Tabs.Panel
						className={SETTINGS_SCROLLING_PANEL_CLASS}
						value="participants"
					>
						<ParticipantsPanel
							bots={bots}
							leadId={leadId}
							onDismiss={onDismiss}
							onLeadChange={onLeadChange}
							onRecruit={onRecruit}
							participants={participants}
						/>
					</Tabs.Panel>

					<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="instructions">
						<SettingsField
							fill
							label={t("conversationSettings.instructions.label")}
							onValueChange={(instructions) => patch({ instructions })}
							placeholder={t("conversationSettings.instructions.placeholder")}
							value={value.instructions}
						/>
					</Tabs.Panel>

					<Tabs.Panel
						className={SETTINGS_SCROLLING_PANEL_CLASS}
						value={DANGER_TAB}
					>
						<DangerZone
							confirmTitle={t("conversationSettings.danger.confirm.title", {
								name: conversationName,
							})}
							deleteLabel={t("conversationSettings.danger.delete")}
							description={t("conversationSettings.danger.description")}
							onDelete={onDelete}
						/>
					</Tabs.Panel>
				</Tabs.Root>
			</Content>
		</Root>
	)
}

export {
	ConversationSettingsDialog,
	type ConversationSettingsDialogProps,
	type ConversationSettingsValue,
	type RosterBot,
}
