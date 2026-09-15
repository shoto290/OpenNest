"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import type {
	BotMcpServerItem,
	BotSkillDraft,
	BotSkillItem,
} from "@workspace/ui/components/bot-settings"
import { DangerZone } from "@workspace/ui/components/bot-settings-dialog/danger-zone"
import type { McpConnectionSection } from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { DialogSurface } from "@workspace/ui/components/dialog-surface"
import {
	type EnvironmentEntry,
	EnvironmentPanel,
	type EnvironmentSection,
	type EnvironmentWrite,
} from "@workspace/ui/components/environment-panel"
import { Icons } from "@workspace/ui/components/icons"
import type { InheritedApplication } from "@workspace/ui/components/plugin-settings/applications-panel"
import type { PluginHistory } from "@workspace/ui/components/plugin-settings/history-panel"
import type { PluginSkillFiles } from "@workspace/ui/components/plugin-settings/skill-files-panel"
import {
	HISTORY_TAB,
	useHistorySession,
} from "@workspace/ui/components/plugin-settings/use-history-session"
import {
	type ApplicationsCatalogueSection,
	useMcpSession,
} from "@workspace/ui/components/plugin-settings/use-mcp-session"
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
import { Dialog, DialogTitle } from "@workspace/ui/components/ui/dialog"
import { useIsNarrowerThan } from "@workspace/ui/hooks/use-is-narrower-than"
import { useSettingsTab } from "@workspace/ui/hooks/use-settings-tab"
import { cn } from "@workspace/ui/lib/utils"

const FIRST_TAB = "space"

const DANGER_TAB = "danger"

type SpaceSettingsDialogProps = {
	open: boolean
	onClose: () => void
	value: SpaceSettingsValue
	onValueChange: (value: SpaceSettingsValue) => void
	environment: EnvironmentEntry[]
	hasEnvironmentFailedToRead?: boolean
	onEnvironmentSet: (write: EnvironmentWrite) => void | Promise<void>
	onEnvironmentDelete: (name: string) => void | Promise<void>
	skills: BotSkillItem[]
	onSkillCreate: (draft: BotSkillDraft, isPreloaded: boolean) => void
	onSkillChange: (id: string, draft: BotSkillDraft) => void
	onSkillPreloadedChange: (id: string, isPreloaded: boolean) => void
	onSkillDelete: (id: string) => void
	skillFiles?: PluginSkillFiles
	mcpServers: BotMcpServerItem[]
	haveMcpServersFailedToLoad?: boolean
	onMcpServerCreate: (name: string, config: Record<string, unknown>) => void
	onMcpServerChange: (
		openedName: string,
		name: string,
		config: Record<string, unknown>,
	) => void
	onMcpServerDelete: (name: string) => void
	companionCount?: number
	mcpServersInherited?: InheritedApplication[]
	mcpCatalogue?: ApplicationsCatalogueSection
	onMcpServerOpen?: (name: string | null) => void
	onServerConnect?: (server: BotMcpServerItem) => void
	serverConnection?: McpConnectionSection
	serverEnvironment?: EnvironmentSection
	tab?: string
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
	environment,
	hasEnvironmentFailedToRead,
	onEnvironmentSet,
	onEnvironmentDelete,
	skills,
	onSkillCreate,
	onSkillChange,
	onSkillPreloadedChange,
	onSkillDelete,
	skillFiles,
	mcpServers,
	haveMcpServersFailedToLoad,
	onMcpServerCreate,
	onMcpServerChange,
	onMcpServerDelete,
	companionCount,
	mcpServersInherited,
	mcpCatalogue,
	onMcpServerOpen,
	onServerConnect,
	serverConnection,
	serverEnvironment,
	tab,
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
	const mcpSession = useMcpSession({
		owner: {
			kind: "space",
			name: spaceName,
			companionCount,
			inherited: mcpServersInherited,
		},
		catalogue: mcpCatalogue,
		servers: mcpServers,
		haveFailedToLoad: haveMcpServersFailedToLoad,
		onServerChange: onMcpServerChange,
		onServerCreate: onMcpServerCreate,
		onServerDelete: onMcpServerDelete,
		onServerOpen: onMcpServerOpen,
		onServerConnect,
		serverConnection,
		serverEnvironment,
	})
	const historySession = useHistorySession({
		history,
		companionName: t("plugin.author.bot"),
	})
	const activeTab = useSettingsTab(open, tab ?? FIRST_TAB)

	const leave = () => {
		skillSession.discard()
		mcpSession.discard()
		historySession.discard()
		onClose()
	}

	const close = () =>
		skillSession.isUnsaved || mcpSession.isUnsaved ? setLeaving(true) : leave()

	const leaveCopy = mcpSession.isOpen
		? {
				title: t("applications.leave.title", { ns: "bots" }),
				description: t("applications.leave.description", { ns: "bots" }),
				action: t("applications.leave.action", { ns: "bots" }),
			}
		: {
				title: t("skills.leave.title", { ns: "bots" }),
				description: t("skills.leave.description", { ns: "bots" }),
				action: t("skills.leave.action", { ns: "bots" }),
			}

	return (
		<Dialog onOpenChange={(next) => !next && close()} open={open}>
			<DialogSurface
				className={cn(
					"h-[34rem] w-[52rem] gap-0 overflow-hidden p-0",
					className,
				)}
			>
				<header className={SETTINGS_HEADER_CLASS}>
					<SpaceTint className="size-5" tint={value.colour} />
					<DialogTitle className="flex min-w-0 items-center gap-1.5 pr-0">
						<span className="truncate">{spaceName}</span>
						<Icons.Next
							aria-hidden="true"
							className="size-3.5 shrink-0 text-muted-foreground"
						/>
						<span className="shrink-0 text-muted-foreground">
							{t("breadcrumb.title")}
						</span>
					</DialogTitle>
				</header>

				{skillSession.editor ?? mcpSession.editor ?? historySession.page ?? (
					<Tabs.Root
						className="flex min-h-0 flex-1"
						onValueChange={activeTab.onValueChange}
						orientation="vertical"
						value={activeTab.value}
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
								icon={Icons.Json}
								iconsOnly={iconsOnly}
								label={t("rail.secrets")}
								value="environment"
							/>
							<SettingsRailItem
								icon={Icons.Skill}
								iconsOnly={iconsOnly}
								label={t("rail.skills")}
								value="skills"
							/>
							<SettingsRailItem
								icon={Icons.Server}
								iconsOnly={iconsOnly}
								label={t("rail.applications")}
								value="mcp"
							/>
							<SettingsRailItem
								icon={Icons.History}
								iconsOnly={iconsOnly}
								label={t("rail.history")}
								value={HISTORY_TAB}
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

						<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="environment">
							<EnvironmentPanel
								entries={environment}
								hasFailedToRead={hasEnvironmentFailedToRead}
								onDelete={onEnvironmentDelete}
								onSet={onEnvironmentSet}
								scope="space"
							/>
						</Tabs.Panel>

						<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="skills">
							{skillSession.panel}
						</Tabs.Panel>

						<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="mcp">
							{mcpSession.panel}
						</Tabs.Panel>

						<SettingsScrollingPanel isFlush value={HISTORY_TAB}>
							{historySession.panel}
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
					confirmLabel={leaveCopy.action}
					description={leaveCopy.description}
					onConfirm={leave}
					onOpenChange={setLeaving}
					open={isLeaving}
					title={leaveCopy.title}
				/>
			</DialogSurface>
		</Dialog>
	)
}

export {
	SpaceSettingsDialog,
	type SpaceSettingsDialogProps,
	type SpaceSettingsValue,
}
