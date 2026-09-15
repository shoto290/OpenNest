"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
	type ActivityIndicatorKind,
	BotIdentityAvatar,
} from "@workspace/ui/components/bot-identity-avatar"
import { BotIdentityFields } from "@workspace/ui/components/bot-identity-fields"
import type {
	BotCommitItem,
	BotIdentity,
	BotMcpServerItem,
	BotModelOption,
	BotOutputStyle,
	BotPermissions,
	BotSettingsValue,
	BotSkillDraft,
	BotSkillItem,
} from "@workspace/ui/components/bot-settings"
import { DangerZone } from "@workspace/ui/components/bot-settings-dialog/danger-zone"
import type { McpConnectionSection } from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import { MemoryPanel } from "@workspace/ui/components/bot-settings-dialog/memory-panel"
import { PermissionsPanel } from "@workspace/ui/components/bot-settings-dialog/permissions-panel"
import { RuntimeFields } from "@workspace/ui/components/bot-settings-dialog/runtime-fields"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { DialogSurface } from "@workspace/ui/components/dialog-surface"
import {
	type EnvironmentEntry,
	EnvironmentPanel,
	type EnvironmentSection,
	type EnvironmentWrite,
} from "@workspace/ui/components/environment-panel"
import { Icons } from "@workspace/ui/components/icons"
import type { ApplicationsInheritance } from "@workspace/ui/components/plugin-settings/applications-panel"
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
import { SettingsField } from "@workspace/ui/components/settings-field"
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
import { Dialog, DialogTitle } from "@workspace/ui/components/ui/dialog"
import { useIsNarrowerThan } from "@workspace/ui/hooks/use-is-narrower-than"
import { useSettingsShortcut } from "@workspace/ui/hooks/use-settings-shortcut"
import { useSettingsTab } from "@workspace/ui/hooks/use-settings-tab"
import { cn } from "@workspace/ui/lib/utils"

const FIRST_TAB = "general"

const DANGER_TAB = "danger"

type BotSettingsDialogProps = {
	open: boolean
	onClose: () => void
	value: BotSettingsValue
	onValueChange: (value: BotSettingsValue) => void
	models: BotModelOption[]
	outputStyle?: BotOutputStyle
	onOutputStyleChange?: (outputStyle: BotOutputStyle) => void
	memory?: string
	onMemoryChange?: (memory: string) => void
	onAvatarUpload: (file: File) => void
	onBrowseWorkingDirectory: () => void
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
	mcpServersInherited?: ApplicationsInheritance
	mcpCatalogue?: ApplicationsCatalogueSection
	environment: EnvironmentEntry[]
	hasEnvironmentFailedToRead?: boolean
	onEnvironmentSet: (write: EnvironmentWrite) => void | Promise<void>
	onEnvironmentDelete: (name: string) => void | Promise<void>
	onMcpServerOpen?: (name: string | null) => void
	onServerConnect?: (server: BotMcpServerItem) => void
	serverConnection?: McpConnectionSection
	serverEnvironment?: EnvironmentSection
	tab?: string
	history?: PluginHistory
	seed?: string
	onDelete: () => void
	showDanger?: boolean
	working?: boolean
	workingKind?: ActivityIndicatorKind
	className?: string
}

const BotSettingsDialog = ({
	open,
	onClose,
	value,
	onValueChange,
	models,
	outputStyle,
	onOutputStyleChange,
	memory,
	onMemoryChange,
	onAvatarUpload,
	onBrowseWorkingDirectory,
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
	mcpServersInherited,
	mcpCatalogue,
	environment,
	hasEnvironmentFailedToRead,
	onEnvironmentSet,
	onEnvironmentDelete,
	onMcpServerOpen,
	onServerConnect,
	serverConnection,
	serverEnvironment,
	tab,
	history,
	seed,
	onDelete,
	showDanger,
	working = false,
	workingKind,
	className,
}: BotSettingsDialogProps) => {
	const { t } = useTranslation("bots")
	const [tabs, setTabs] = useState<HTMLDivElement | null>(null)
	const [isLeaving, setLeaving] = useState(false)
	const iconsOnly = useIsNarrowerThan(tabs, RAIL_LABELS_MIN_WIDTH)
	const botName = value.name.trim() || t("dialog.untitled")
	const skillSession = useSkillSession({
		skills,
		files: skillFiles,
		onSkillChange,
		onSkillCreate,
		onSkillDelete,
		onSkillPreloadedChange,
	})
	const mcpSession = useMcpSession({
		owner: { kind: "companion", name: botName, inherited: mcpServersInherited },
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
		companion: value.identity,
		companionName: botName,
	})
	const activeTab = useSettingsTab(
		open,
		showDanger ? DANGER_TAB : (tab ?? FIRST_TAB),
	)

	const patch = (fields: Partial<BotSettingsValue>) =>
		onValueChange({ ...value, ...fields })

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
				title: t("applications.leave.title"),
				description: t("applications.leave.description"),
				action: t("applications.leave.action"),
			}
		: {
				title: t("skills.leave.title"),
				description: t("skills.leave.description"),
				action: t("skills.leave.action"),
			}

	useSettingsShortcut({ isEnabled: open, onToggle: close })

	return (
		<Dialog onOpenChange={(next) => !next && close()} open={open}>
			<DialogSurface
				className={cn(
					"h-[34rem] w-[52rem] gap-0 overflow-hidden p-0",
					className,
				)}
			>
				<header className={SETTINGS_HEADER_CLASS}>
					<BotIdentityAvatar
						animal={value.identity.animal}
						blot={value.identity.blot}
						image={value.identity.image}
						kind={workingKind}
						name={botName}
						seed={seed}
						size={32}
						working={working}
					/>
					<DialogTitle className="flex min-w-0 items-center gap-1.5 pr-0">
						<span className="truncate">{botName}</span>
						<Icons.Next
							aria-hidden="true"
							className="size-3.5 shrink-0 text-muted-foreground"
						/>
						<span className="shrink-0 text-muted-foreground">
							{t("dialog.breadcrumb")}
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
								icon={Icons.Settings}
								iconsOnly={iconsOnly}
								label={t("dialog.tab.general")}
								value={FIRST_TAB}
							/>
							<SettingsRailItem
								icon={Icons.Image}
								iconsOnly={iconsOnly}
								label={t("dialog.tab.appearance")}
								value="appearance"
							/>
							<SettingsRailItem
								icon={Icons.Docs}
								iconsOnly={iconsOnly}
								label={t("dialog.tab.instructions")}
								value="instructions"
							/>
							<SettingsRailItem
								icon={Icons.Skill}
								iconsOnly={iconsOnly}
								label={t("dialog.tab.skills")}
								value="skills"
							/>
							<SettingsRailItem
								icon={Icons.Server}
								iconsOnly={iconsOnly}
								label={t("dialog.tab.applications")}
								value="mcp"
							/>
							<SettingsRailItem
								icon={Icons.Json}
								iconsOnly={iconsOnly}
								label={t("dialog.tab.secrets")}
								value="environment"
							/>
							{history ? (
								<SettingsRailItem
									icon={Icons.History}
									iconsOnly={iconsOnly}
									label={t("dialog.tab.history")}
									value={HISTORY_TAB}
								/>
							) : null}
							<SettingsRailItem
								icon={Icons.Shield}
								iconsOnly={iconsOnly}
								label={t("dialog.tab.approvals")}
								value="permissions"
							/>
							<SettingsRailItem
								icon={Icons.Terminal}
								iconsOnly={iconsOnly}
								label={t("dialog.tab.runtime")}
								value="runtime"
							/>
							<SettingsRailSeparator />
							<SettingsRailItem
								className={DANGER_RAIL_ITEM_CLASS}
								icon={Icons.Alert}
								iconsOnly={iconsOnly}
								label={t("dialog.tab.danger")}
								value={DANGER_TAB}
							/>
						</SettingsRail>

						<SettingsScrollingPanel value={FIRST_TAB}>
							<SettingsField
								label={t("dialog.name.label")}
								onValueChange={(name) => patch({ name })}
								placeholder={t("dialog.name.placeholder")}
								value={value.name}
							/>
							<SettingsField
								label={t("dialog.title.label")}
								onValueChange={(title) => patch({ title })}
								placeholder={t("dialog.title.placeholder")}
								value={value.title}
							/>
						</SettingsScrollingPanel>

						<SettingsScrollingPanel value="appearance">
							<BotIdentityFields
								identity={value.identity}
								name={botName}
								onAvatarUpload={onAvatarUpload}
								onIdentityChange={(identity: BotIdentity) =>
									patch({ identity })
								}
								seed={seed}
								working={working}
								workingKind={workingKind}
							/>
						</SettingsScrollingPanel>

						<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="instructions">
							<SettingsField
								fill
								label={t("dialog.instructions.label")}
								onValueChange={(instructions) => patch({ instructions })}
								placeholder={t("dialog.instructions.placeholder")}
								value={value.instructions}
							/>
							{memory !== undefined ? (
								<MemoryPanel
									memory={memory}
									onSave={(next) => onMemoryChange?.(next)}
								/>
							) : null}
						</Tabs.Panel>

						<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="skills">
							{skillSession.panel}
						</Tabs.Panel>

						<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="mcp">
							{mcpSession.panel}
						</Tabs.Panel>

						<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="environment">
							<EnvironmentPanel
								entries={environment}
								hasFailedToRead={hasEnvironmentFailedToRead}
								onDelete={onEnvironmentDelete}
								onSet={onEnvironmentSet}
								scope="bot"
							/>
						</Tabs.Panel>

						{history ? (
							<SettingsScrollingPanel isFlush value={HISTORY_TAB}>
								{historySession.panel}
							</SettingsScrollingPanel>
						) : null}

						<SettingsScrollingPanel value="permissions">
							<PermissionsPanel
								onPermissionsChange={(permissions: BotPermissions) =>
									patch({ permissions })
								}
								permissions={value.permissions}
							/>
						</SettingsScrollingPanel>

						<SettingsScrollingPanel value="runtime">
							<RuntimeFields
								model={value.model}
								models={models}
								onBrowseWorkingDirectory={onBrowseWorkingDirectory}
								onModelChange={(model) => patch({ model })}
								onOutputStyleChange={onOutputStyleChange}
								outputStyle={outputStyle}
								workingDirectory={value.workingDirectory}
							/>
						</SettingsScrollingPanel>

						<SettingsScrollingPanel value={DANGER_TAB}>
							<DangerZone
								confirmTitle={t("danger.confirm.title", { name: botName })}
								deleteLabel={t("danger.delete")}
								description={t("danger.description")}
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
	type BotCommitItem,
	type BotMcpServerItem,
	type BotModelOption,
	type BotOutputStyle,
	type BotPermissions,
	BotSettingsDialog,
	type BotSettingsDialogProps,
	type BotSettingsValue,
	type BotSkillDraft,
	type BotSkillItem,
	type PluginHistory,
}
