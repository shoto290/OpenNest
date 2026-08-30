"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import type {
	BotSkillDraft,
	BotSkillItem,
} from "@workspace/ui/components/bot-settings"
import { DangerZone } from "@workspace/ui/components/bot-settings-dialog/danger-zone"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Content, Root, Title } from "@workspace/ui/components/dialog"
import { Icons } from "@workspace/ui/components/icons"
import {
	HistoryPanel,
	type PluginHistory,
} from "@workspace/ui/components/plugin-settings/history-panel"
import type { PluginSkillFiles } from "@workspace/ui/components/plugin-settings/skill-files-panel"
import { useSkillSession } from "@workspace/ui/components/plugin-settings/use-skill-session"
import {
	DANGER_RAIL_ITEM_CLASS,
	RAIL_LABELS_MIN_WIDTH,
	SETTINGS_PANEL_CLASS,
	SettingsRail,
	SettingsRailItem,
	SettingsRailSeparator,
	SettingsScrollingPanel,
} from "@workspace/ui/components/settings-rail"
import { SETTINGS_HEADER_CLASS } from "@workspace/ui/components/settings-styles"
import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"
import { SpaceFields } from "@workspace/ui/components/space-settings-dialog/space-fields"
import { SpaceTint } from "@workspace/ui/components/space-tint"
import { useIsNarrowerThan } from "@workspace/ui/hooks/use-is-narrower-than"
import { cn } from "@workspace/ui/lib/utils"

const FIRST_TAB = "space"

const DANGER_TAB = "danger"

type SpaceSettingsDialogProps = {
	open: boolean
	onClose: () => void
	value: SpaceSettingsValue
	onValueChange: (value: SpaceSettingsValue) => void
	skills: BotSkillItem[]
	onSkillCreate: (draft: BotSkillDraft, isPreloaded: boolean) => void
	onSkillChange: (id: string, draft: BotSkillDraft) => void
	onSkillPreloadedChange: (id: string, isPreloaded: boolean) => void
	onSkillDelete: (id: string) => void
	skillFiles?: PluginSkillFiles
	history: PluginHistory
	onDelete: () => void
	isDeletable?: boolean
	className?: string
}

const SpaceSettingsDialog = ({
	open,
	onClose,
	value,
	onValueChange,
	skills,
	onSkillCreate,
	onSkillChange,
	onSkillPreloadedChange,
	onSkillDelete,
	skillFiles,
	history,
	onDelete,
	isDeletable = true,
	className,
}: SpaceSettingsDialogProps) => {
	const { t } = useTranslation("settings")
	const [tabs, setTabs] = useState<HTMLDivElement | null>(null)
	const [isLeaving, setLeaving] = useState(false)
	const iconsOnly = useIsNarrowerThan(tabs, RAIL_LABELS_MIN_WIDTH)
	const spaceName = value.name.trim() || t("space.untitled")
	const skillSession = useSkillSession({
		files: skillFiles,
		onSkillChange,
		onSkillCreate,
		onSkillDelete,
		onSkillPreloadedChange,
		skills,
	})

	const leave = () => {
		skillSession.discard()
		onClose()
	}

	const close = () => (skillSession.isUnsaved ? setLeaving(true) : leave())

	return (
		<Root onOpenChange={(next) => !next && close()} open={open}>
			<Content
				className={cn(
					"h-[34rem] w-[52rem] gap-0 overflow-hidden p-0",
					className,
				)}
			>
				<header className={SETTINGS_HEADER_CLASS}>
					<SpaceTint className="size-5" tint={value.colour} />
					<Title className="flex min-w-0 items-center gap-1.5 pr-0">
						<span className="truncate">{spaceName}</span>
						<Icons.Next
							aria-hidden="true"
							className="size-3.5 shrink-0 text-muted-foreground"
						/>
						<span className="shrink-0 text-muted-foreground">
							{t("breadcrumb.title")}
						</span>
					</Title>
				</header>

				{skillSession.editor ?? (
					<Tabs.Root
						className="flex min-h-0 flex-1"
						defaultValue={FIRST_TAB}
						orientation="vertical"
						ref={setTabs}
					>
						<SettingsRail iconsOnly={iconsOnly}>
							<SettingsRailItem
								icon={Icons.Folder}
								iconsOnly={iconsOnly}
								label={t("rail.space")}
								value={FIRST_TAB}
							/>
							<SettingsRailItem
								icon={Icons.Skill}
								iconsOnly={iconsOnly}
								label={t("rail.skills")}
								value="skills"
							/>
							<SettingsRailItem
								icon={Icons.History}
								iconsOnly={iconsOnly}
								label={t("rail.history")}
								value="history"
							/>
							<SettingsRailSeparator />
							<SettingsRailItem
								className={DANGER_RAIL_ITEM_CLASS}
								icon={Icons.Alert}
								iconsOnly={iconsOnly}
								label={t("rail.danger")}
								value={DANGER_TAB}
							/>
						</SettingsRail>

						<SettingsScrollingPanel value={FIRST_TAB}>
							<SpaceFields onValueChange={onValueChange} value={value} />
						</SettingsScrollingPanel>

						<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="skills">
							{skillSession.panel}
						</Tabs.Panel>

						<SettingsScrollingPanel value="history">
							<HistoryPanel
								authorName={t("plugin.author.bot")}
								commits={history.commits}
								onLoadDiff={history.onLoadDiff}
								onRevert={history.onRevert}
							/>
						</SettingsScrollingPanel>

						<SettingsScrollingPanel value={DANGER_TAB}>
							<DangerZone
								confirmTitle={t("space.danger.confirm.title", {
									name: spaceName,
								})}
								deleteLabel={t("space.danger.delete")}
								description={t("space.danger.description")}
								disabledReason={
									isDeletable ? undefined : t("space.danger.last")
								}
								onDelete={onDelete}
							/>
						</SettingsScrollingPanel>
					</Tabs.Root>
				)}

				<ConfirmDialog
					confirmLabel={t("skills.leave.action", { ns: "bots" })}
					description={t("skills.leave.description", { ns: "bots" })}
					onConfirm={leave}
					onOpenChange={setLeaving}
					open={isLeaving}
					title={t("skills.leave.title", { ns: "bots" })}
				/>
			</Content>
		</Root>
	)
}

export {
	SpaceSettingsDialog,
	type SpaceSettingsDialogProps,
	type SpaceSettingsValue,
}
