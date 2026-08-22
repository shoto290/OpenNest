"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
	BotIdentityAvatar,
	type BotWorkingKind,
} from "@workspace/ui/components/bot-identity-avatar"
import { BotIdentityFields } from "@workspace/ui/components/bot-identity-fields"
import {
	BLANK_MCP_SERVER_DRAFT,
	BLANK_SKILL_DRAFT,
	type BotIdentity,
	type BotMcpServerDraft,
	type BotMcpServerItem,
	type BotModelOption,
	type BotSettingsValue,
	type BotSkillDraft,
	type BotSkillItem,
	isMcpServerDraftUnsaved,
	isSkillDraftUnsaved,
	toMcpServerDraft,
} from "@workspace/ui/components/bot-settings"
import { DangerZone } from "@workspace/ui/components/bot-settings-dialog/danger-zone"
import { McpServerEditor } from "@workspace/ui/components/bot-settings-dialog/mcp-server-editor"
import { McpServersPanel } from "@workspace/ui/components/bot-settings-dialog/mcp-servers-panel"
import { RuntimeFields } from "@workspace/ui/components/bot-settings-dialog/runtime-fields"
import { SkillEditor } from "@workspace/ui/components/bot-settings-dialog/skill-editor"
import { SkillsPanel } from "@workspace/ui/components/bot-settings-dialog/skills-panel"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Content, Root, Title } from "@workspace/ui/components/dialog"
import { Icons } from "@workspace/ui/components/icons"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	RAIL_ITEM_CLASS,
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

/** The tab a reader lands on whenever the dialog opens on its own account. Settings
 * a bot has none of yet are still the first thing to fill in — unless the host opened
 * it from a row's own delete, which lands on [`DANGER_TAB`] instead. */
const FIRST_TAB = "general"

const DANGER_TAB = "danger"

/** A skill held open on the whole dialog: the draft as it is being written, and the
 * skill it was opened on to weigh it against. No skill for a creation — there is
 * nothing kept to compare a first draft to. */
type SkillSession = {
	draft: BotSkillDraft
	opened?: BotSkillItem
}

/** A server held open on the whole dialog: the draft as it is being written, and the
 * server it was opened on to weigh it against — which is also where it is filed, so a
 * rename is reported against that name. No server for a creation. */
type McpSession = {
	draft: BotMcpServerDraft
	saved?: BotMcpServerDraft
}

const DANGER_RAIL_ITEM_CLASS = cn(
	RAIL_ITEM_CLASS,
	"text-destructive hover:bg-destructive/10 hover:text-destructive data-active:bg-destructive/10 data-active:text-destructive",
)

type BotSettingsDialogProps = {
	open: boolean
	/** Fired for every way out — Escape, the backdrop, the corner affordance. Asked
	 * through a question while a skill is open with something unsaved: the editor
	 * saves on a press, so closing over it would drop what was typed. */
	onClose: () => void
	value: BotSettingsValue
	/** Fired on every edit — the dialog keeps no draft and owns no persistence. */
	onValueChange: (value: BotSettingsValue) => void
	models: BotModelOption[]
	/** Receives the picked, dropped or pasted file. The host turns it into a URL
	 * and writes it back as `value.identity.image`. */
	onAvatarUpload: (file: File) => void
	/** Opens the host's folder picker. */
	onBrowseWorkingDirectory: () => void
	/** Every skill the bot carries. Read and written on its own tab rather than
	 * through `value`: a skill lives in the bot's bundle, not in the row the rest of
	 * this panel edits. */
	skills: BotSkillItem[]
	onSkillCreate: (draft: BotSkillDraft, isPreloaded: boolean) => void
	/** Addressed by id, never by name: renaming a skill moves nothing on the disk. */
	onSkillChange: (id: string, draft: BotSkillDraft) => void
	onSkillPreloadedChange: (id: string, isPreloaded: boolean) => void
	onSkillDelete: (id: string) => void
	/** Every MCP server the bot declares. Read and written on its own tab, like the
	 * skills and for the same reason: a server lives in the bot's bundle rather than
	 * in the row the rest of this panel edits. */
	mcpServers: BotMcpServerItem[]
	onMcpServerCreate: (name: string, config: Record<string, unknown>) => void
	/** Addressed by the name the editor was opened on: the name is the key the
	 * server is filed under, so a rename moves it. */
	onMcpServerChange: (
		openedName: string,
		name: string,
		config: Record<string, unknown>,
	) => void
	onMcpServerDelete: (name: string) => void
	/** The edited bot's id. It is what its blot's shape is derived from, so the
	 * breadcrumb shows the mark the roster row behind it is already showing. */
	seed?: string
	/** Fired only once the confirmation is accepted. */
	onDelete: () => void
	/** Whether the dialog opens on the Danger zone rather than on the first group, for
	 * a host opened from a row's own delete. It only picks the group — the question is
	 * still the reader's to ask, on the tab's own button. Read once, as the dialog
	 * mounts: a host that keeps it mounted across opens has to key it to be heard. */
	showDanger?: boolean
	/** The only thing that makes the breadcrumb avatar move. */
	working?: boolean
	/** What the bot is busy with while `working`. Its own animal performs it. */
	workingKind?: BotWorkingKind
	className?: string
}

/**
 * Everything a bot is, in one overlay: a breadcrumb naming the bot it belongs to,
 * a rail of groups down the left and one group at a time on the right. It is fully
 * controlled and saves as you type — every keystroke emits `onValueChange` with the
 * whole value, and the dialog owns no draft, no debounce and no persistence. A skill
 * is the exception: its editor saves on a press, so a way out taken over one with
 * something unsaved asks before it drops the draft.
 *
 * The breadcrumb and the rail hold still; only the open group scrolls. Below 42rem
 * of content the rail drops to its icons, and only then do its items carry a
 * tooltip — a name a reader can already read is not worth saying twice.
 */
const BotSettingsDialog = ({
	open,
	onClose,
	value,
	onValueChange,
	models,
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
	seed,
	onDelete,
	showDanger,
	working = false,
	workingKind,
	className,
}: BotSettingsDialogProps) => {
	const { t } = useTranslation("bots")
	const [tabs, setTabs] = useState<HTMLDivElement | null>(null)
	const [skill, setSkill] = useState<SkillSession | null>(null)
	const [server, setServer] = useState<McpSession | null>(null)
	const [isLeaving, setLeaving] = useState(false)
	const iconsOnly = useIsNarrowerThan(tabs, RAIL_LABELS_MIN_WIDTH)
	const botName = value.name.trim() || t("dialog.untitled")

	const patch = (fields: Partial<BotSettingsValue>) =>
		onValueChange({ ...value, ...fields })

	// The open skill weighed against what is kept, exactly as its editor weighs it:
	// the same draft is unsaved on both sides, so the way out of the dialog asks the
	// same question the way back to the list does.
	const isSkillUnsaved = Boolean(
		skill && isSkillDraftUnsaved(skill.draft, skill.opened),
	)

	// The open server weighed the same way, so a dialog closed over one asks before it
	// drops the draft its own editor would have asked about.
	const isServerUnsaved = Boolean(
		server && isMcpServerDraftUnsaved(server.draft, server.saved),
	)

	const leave = () => {
		setSkill(null)
		setServer(null)
		onClose()
	}

	const close = () =>
		isSkillUnsaved || isServerUnsaved ? setLeaving(true) : leave()

	// The question names what is about to be dropped, so it is the open editor's own.
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

	// The chord that opened the dialog closes it, and closes it the way Escape and
	// the backdrop do: a host that flipped `open` itself would take an unsaved skill
	// with it without ever asking.
	useSettingsShortcut({ isEnabled: open, onToggle: close })

	// The mark is written with the rest of the skill rather than the moment it is
	// pressed: the editor saves on a press, so what the bot was told and what the
	// skill says leave together, and only when either actually moved.
	const saveSkill = ({ draft, opened }: SkillSession) => {
		const isPreloaded = draft.isPreloaded ?? false

		if (!opened) {
			onSkillCreate(draft, isPreloaded)
		} else {
			onSkillChange(opened.id, draft)
			if (isPreloaded !== opened.isPreloaded) {
				onSkillPreloadedChange(opened.id, isPreloaded)
			}
		}

		setSkill(null)
	}

	const deleteSkill = (opened: BotSkillItem) => {
		onSkillDelete(opened.id)
		setSkill(null)
	}

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

	const openSkillEditor = ({ draft, opened }: SkillSession) => (
		<SkillEditor
			draft={draft}
			onBack={() => setSkill(null)}
			onDelete={opened ? () => deleteSkill(opened) : undefined}
			onDraftChange={(next) => setSkill({ draft: next, opened })}
			onSave={() => saveSkill({ draft, opened })}
			saved={opened}
		/>
	)

	// One editor at a time, and either of them takes the whole dialog: a skill and a
	// server both replace the rail with one of their own.
	const openEditor = () => {
		if (skill) return openSkillEditor(skill)
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
						</Tabs.Panel>

						<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="skills">
							<SkillsPanel
								onAdd={() => setSkill({ draft: BLANK_SKILL_DRAFT })}
								onOpen={(opened) => setSkill({ draft: opened, opened })}
								skills={skills}
							/>
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
								workingDirectory={value.workingDirectory}
							/>
						</Tabs.Panel>

						<Tabs.Panel
							className={SETTINGS_SCROLLING_PANEL_CLASS}
							value={DANGER_TAB}
						>
							<DangerZone botName={botName} onDelete={onDelete} />
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
	type BotMcpServerItem,
	type BotModelOption,
	BotSettingsDialog,
	type BotSettingsDialogProps,
	type BotSettingsValue,
	type BotSkillDraft,
	type BotSkillItem,
}
