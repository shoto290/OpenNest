"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
	type ActivityIndicatorKind,
	BotIdentityAvatar,
} from "@workspace/ui/components/bot-identity-avatar"
import { BotIdentityFields } from "@workspace/ui/components/bot-identity-fields"
import {
	BLANK_MCP_SERVER_DRAFT,
	type BotCommitItem,
	type BotIdentity,
	type BotMcpServerDraft,
	type BotMcpServerItem,
	type BotModelOption,
	type BotOutputStyle,
	type BotSettingsValue,
	type BotSkillDraft,
	type BotSkillItem,
	isMcpServerDraftUnsaved,
	toMcpServerDraft,
} from "@workspace/ui/components/bot-settings"
import { DangerZone } from "@workspace/ui/components/bot-settings-dialog/danger-zone"
import { McpServerEditor } from "@workspace/ui/components/bot-settings-dialog/mcp-server-editor"
import { McpServersPanel } from "@workspace/ui/components/bot-settings-dialog/mcp-servers-panel"
import { MemoryPanel } from "@workspace/ui/components/bot-settings-dialog/memory-panel"
import { RuntimeFields } from "@workspace/ui/components/bot-settings-dialog/runtime-fields"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Content, Root, Title } from "@workspace/ui/components/dialog"
import { Icons } from "@workspace/ui/components/icons"
import {
	HistoryPanel,
	type PluginHistory,
} from "@workspace/ui/components/plugin-settings/history-panel"
import { useSkillSession } from "@workspace/ui/components/plugin-settings/use-skill-session"
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
import { useSettingsShortcut } from "@workspace/ui/hooks/use-settings-shortcut"
import { cn } from "@workspace/ui/lib/utils"

const FIRST_TAB = "general"

const DANGER_TAB = "danger"

type McpSession = {
	draft: BotMcpServerDraft
	saved?: BotMcpServerDraft
}

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
	mcpServers: BotMcpServerItem[]
	onMcpServerCreate: (name: string, config: Record<string, unknown>) => void
	onMcpServerChange: (
		openedName: string,
		name: string,
		config: Record<string, unknown>,
	) => void
	onMcpServerDelete: (name: string) => void
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
	mcpServers,
	onMcpServerCreate,
	onMcpServerChange,
	onMcpServerDelete,
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
	const [server, setServer] = useState<McpSession | null>(null)
	const [isLeaving, setLeaving] = useState(false)
	const iconsOnly = useIsNarrowerThan(tabs, RAIL_LABELS_MIN_WIDTH)
	const botName = value.name.trim() || t("dialog.untitled")
	const skillSession = useSkillSession({
		skills,
		onSkillChange,
		onSkillCreate,
		onSkillDelete,
		onSkillPreloadedChange,
	})

	const patch = (fields: Partial<BotSettingsValue>) =>
		onValueChange({ ...value, ...fields })

	const isServerUnsaved = Boolean(
		server && isMcpServerDraftUnsaved(server.draft, server.saved),
	)

	const leave = () => {
		skillSession.discard()
		setServer(null)
		onClose()
	}

	const close = () =>
		skillSession.isUnsaved || isServerUnsaved ? setLeaving(true) : leave()

	const leaveCopy = server
		? {
				title: t("mcp.leave.title"),
				description: t("mcp.leave.description"),
				action: t("mcp.leave.action"),
			}
		: {
				title: t("skills.leave.title"),
				description: t("skills.leave.description"),
				action: t("skills.leave.action"),
			}

	useSettingsShortcut({ isEnabled: open, onToggle: close })

	const saveServer = (
		{ draft, saved }: McpSession,
		config: Record<string, unknown>,
	) => {
		if (saved) {
			onMcpServerChange(saved.name, draft.name, config)
		} else {
			onMcpServerCreate(draft.name, config)
		}

		setServer(null)
	}

	const deleteServer = (saved: BotMcpServerDraft) => {
		onMcpServerDelete(saved.name)
		setServer(null)
	}

	const openServerEditor = ({ draft, saved }: McpSession) => (
		<McpServerEditor
			draft={draft}
			onBack={() => setServer(null)}
			onDelete={saved ? () => deleteServer(saved) : undefined}
			onDraftChange={(next) => setServer({ draft: next, saved })}
			onSave={(config) => saveServer({ draft, saved }, config)}
			saved={saved}
		/>
	)

	const openEditor = () => {
		if (skillSession.editor) return skillSession.editor
		if (server) return openServerEditor(server)

		return null
	}

	return (
		<Root onOpenChange={(next) => !next && close()} open={open}>
			<Content
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
					<Title className="flex min-w-0 items-center gap-1.5 pr-0">
						<span className="truncate">{botName}</span>
						<Icons.Next
							aria-hidden="true"
							className="size-3.5 shrink-0 text-muted-foreground"
						/>
						<span className="shrink-0 text-muted-foreground">
							{t("dialog.breadcrumb")}
						</span>
					</Title>
				</header>

				{openEditor() ?? (
					<Tabs.Root
						className="flex min-h-0 flex-1"
						defaultValue={showDanger ? DANGER_TAB : FIRST_TAB}
						orientation="vertical"
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
								label={t("dialog.tab.mcp")}
								value="mcp"
							/>
							{history ? (
								<SettingsRailItem
									icon={Icons.History}
									iconsOnly={iconsOnly}
									label={t("dialog.tab.history")}
									value="history"
								/>
							) : null}
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

						<Tabs.Panel
							className={SETTINGS_SCROLLING_PANEL_CLASS}
							value={FIRST_TAB}
						>
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
						</Tabs.Panel>

						<Tabs.Panel
							className={SETTINGS_SCROLLING_PANEL_CLASS}
							value="appearance"
						>
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
						</Tabs.Panel>

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
							<McpServersPanel
								onAdd={() => setServer({ draft: BLANK_MCP_SERVER_DRAFT })}
								onOpen={(opened) =>
									setServer({
										draft: toMcpServerDraft(opened),
										saved: toMcpServerDraft(opened),
									})
								}
								servers={mcpServers}
							/>
						</Tabs.Panel>

						{history ? (
							<Tabs.Panel
								className={SETTINGS_SCROLLING_PANEL_CLASS}
								value="history"
							>
								<HistoryPanel
									authorName={botName}
									commits={history.commits}
									onLoadDiff={history.onLoadDiff}
									onRevert={history.onRevert}
								/>
							</Tabs.Panel>
						) : null}

						<Tabs.Panel
							className={SETTINGS_SCROLLING_PANEL_CLASS}
							value="runtime"
						>
							<RuntimeFields
								changesNothing={value.changesNothing}
								model={value.model}
								models={models}
								onBrowseWorkingDirectory={onBrowseWorkingDirectory}
								onChangesNothingChange={(changesNothing) =>
									patch({ changesNothing })
								}
								onModelChange={(model) => patch({ model })}
								onOutputStyleChange={onOutputStyleChange}
								outputStyle={outputStyle}
								workingDirectory={value.workingDirectory}
							/>
						</Tabs.Panel>

						<Tabs.Panel
							className={SETTINGS_SCROLLING_PANEL_CLASS}
							value={DANGER_TAB}
						>
							<DangerZone
								confirmTitle={t("danger.confirm.title", { name: botName })}
								deleteLabel={t("danger.delete")}
								description={t("danger.description")}
								onDelete={onDelete}
							/>
						</Tabs.Panel>
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
			</Content>
		</Root>
	)
}

export {
	type BotCommitItem,
	type BotMcpServerItem,
	type BotModelOption,
	type BotOutputStyle,
	BotSettingsDialog,
	type BotSettingsDialogProps,
	type BotSettingsValue,
	type BotSkillDraft,
	type BotSkillItem,
	type PluginHistory,
}
