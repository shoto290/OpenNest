import { useCallback, useEffect, useMemo, useState } from "react"

import { AgentSidebar } from "@workspace/ui/components/agents/agent-sidebar"
import { AppBootScreen } from "@workspace/ui/components/app-boot-screen"
import { AppHeader } from "@workspace/ui/components/app-header"
import { readBotOutputStyle } from "@workspace/ui/components/bot-settings"
import { BotSettingsDialog } from "@workspace/ui/components/bot-settings-dialog"
import { UpdateBadge } from "@workspace/ui/components/update-badge"
import { UserSettingsDialog } from "@workspace/ui/components/user-settings-dialog"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"
import { useSettingsShortcut } from "@workspace/ui/hooks/use-settings-shortcut"

import { ChatScreen } from "@/components/chat-screen"
import { useTheme } from "@/components/theme-provider"
import {
	changesRuntime,
	modelOptionsFor,
	toCommitItem,
	toRosterBots,
	toSettingsValue,
} from "@/lib/bots/bot-settings"
import { toSkillDraft, toSkillItem } from "@/lib/bots/skill-draft"
import { useBotHistory } from "@/lib/bots/use-bot-history"
import { useBotMcpServers } from "@/lib/bots/use-bot-mcp-servers"
import { useBotSkills } from "@/lib/bots/use-bot-skills"
import { useModelCatalogue } from "@/lib/bots/use-model-catalogue"
import { useRoster } from "@/lib/bots/use-roster"
import { useRosterClock } from "@/lib/bots/use-roster-clock"
import { createAttachmentsController } from "@/lib/chat/attachments-controller"
import { createChatDriver } from "@/lib/chat/create-driver"
import { useBotActivity, useBotPreviews, useChat } from "@/lib/chat/use-chat"
import { createTranscriptStore } from "@/lib/conversations/create-store"
import { useExternalLinks } from "@/lib/links/use-external-links"
import { useNotifications } from "@/lib/notifications/use-notifications"
import { toUpdateBadgeProps } from "@/lib/updater/badge-model"
import { useUpdater } from "@/lib/updater/use-updater"
import { chosenLanguage, storeLanguage } from "@/lib/user/language-mirror"
import { useUser } from "@/lib/user/use-user"
import {
	toNotificationChange,
	toUserSettingsValue,
} from "@/lib/user/user-settings"

const browseWorkingDirectory = () => undefined

export function App() {
	const driver = useMemo(createChatDriver, [])
	const store = useMemo(createTranscriptStore, [])
	const chat = useChat(driver, store)

	const attachments = useMemo(
		() =>
			createAttachmentsController({
				store: chat.controller.storeAttachments,
				send: chat.controller.sendTo,
			}),
		[chat.controller],
	)
	const roster = useRoster(store)
	const skills = useBotSkills(store)
	const mcpServers = useBotMcpServers(store)
	const history = useBotHistory(store)
	const catalogue = useModelCatalogue()
	const user = useUser()
	const theme = useTheme()

	const updater = useUpdater()

	useExternalLinks()

	useNotifications({
		chat: chat.controller,
		roster: roster.controller,
		user: user.controller,
	})

	const { bots, selectedBotId, isEditing, isShowingDanger, hasLoaded } =
		roster.state
	const selected = bots.find((bot) => bot.id === selectedBotId)

	useEffect(() => {
		void roster.controller.load()
	}, [roster.controller])

	useEffect(() => {
		void user.controller.load()
	}, [user.controller])

	useEffect(() => {
		if (selectedBotId) {
			void skills.controller.open(selectedBotId)
			void mcpServers.controller.open(selectedBotId)
			void history.controller.open(selectedBotId)
		}
	}, [
		history.controller,
		mcpServers.controller,
		skills.controller,
		selectedBotId,
	])

	useEffect(() => {
		if (selectedBotId) {
			void chat.controller.open(selectedBotId)
		}
	}, [chat.controller, selectedBotId])

	const deleteBot = async (id: string) => {
		await chat.controller.close(id)
		attachments.forget(id)
		await roster.controller.remove(id)
	}

	const botIds = useMemo(() => bots.map((bot) => bot.id), [bots])
	const working = useBotActivity(chat.controller, botIds)
	const previews = useBotPreviews(
		chat.controller,
		botIds,
		roster.state.previews,
	)
	const activity = selectedBotId ? working[selectedBotId] : undefined

	const busyBotCount = useMemo(
		() => Object.values(working).filter((bot) => bot.isWorking).length,
		[working],
	)

	const updateBadge = useMemo(
		() => (
			<UpdateBadge
				{...toUpdateBadgeProps({ state: updater.state, busyBotCount })}
				onDownload={() => {
					void updater.controller.install()
				}}
				onRestart={() => {
					if (busyBotCount === 0) {
						void updater.controller.restart()
					}
				}}
			/>
		),
		[updater.state, updater.controller, busyBotCount],
	)

	const now = useRosterClock()
	const rosterBots = useMemo(
		() => toRosterBots(bots, { working, previews }, now),
		[bots, working, previews, now],
	)

	const toggleSettings = useCallback(
		() => roster.controller.setEditing(!isEditing),
		[roster.controller, isEditing],
	)

	const userSettings = useMemo(
		() =>
			toUserSettingsValue(user.state.profile, {
				colorScheme: theme.theme,
				palette: theme.palette,
			}),
		[user.state.profile, theme.theme, theme.palette],
	)

	const [language, setLanguage] = useState(chosenLanguage)

	useSettingsShortcut({
		isEnabled: Boolean(selected) && !isEditing,
		onToggle: toggleSettings,
	})

	return (
		<>
			<WorkspaceShell
				defaultOpen
				sidebar={
					<AgentSidebar
						data-tauri-drag-region="deep"
						bots={rosterBots}
						footer={updateBadge}
						onCreateBot={() => {
							void roster.controller.create()
						}}
						onDeleteBot={roster.controller.askToDelete}
						onDuplicateBot={(id) => {
							void roster.controller.duplicate(id)
						}}
						onEditBot={roster.controller.edit}
						onOpenUserSettings={() => user.controller.setSettingsOpen(true)}
						onSelectBot={roster.controller.select}
						selectedBotId={selectedBotId ?? undefined}
						user={userSettings}
					/>
				}
			>
				{!hasLoaded ? (
					<AppBootScreen data-tauri-drag-region="deep" />
				) : selected ? (
					<ChatScreen
						bot={selected}
						chat={chat}
						attachments={attachments}
						isSettingsOpen={isEditing}
						isOverlayOpen={isEditing || user.state.isSettingsOpen}
						onToggleSettings={toggleSettings}
					/>
				) : (
					<AppHeader insetWindowControls data-tauri-drag-region="deep" />
				)}
			</WorkspaceShell>
			{selected ? (
				<BotSettingsDialog
					history={{
						commits: history.state.commits.map(toCommitItem),
						onLoadDiff: history.controller.loadDiff,
						onRevert: (commitId) => {
							history.controller.revert(commitId)
							chat.controller.redescribe(selected.id)
						},
					}}
					mcpServers={mcpServers.state.servers}
					models={modelOptionsFor(selected.model, catalogue)}
					outputStyle={readBotOutputStyle(selected.outputStyle)}
					memory={selected.memory}
					onMemoryChange={(memory) => {
						void roster.controller.remember(selected.id, memory)
					}}
					onAvatarUpload={(file) => {
						void roster.controller.uploadAvatar(selected.id, file)
					}}
					onBrowseWorkingDirectory={browseWorkingDirectory}
					onClose={() => roster.controller.setEditing(false)}
					onDelete={() => {
						void deleteBot(selected.id)
					}}
					onOutputStyleChange={(outputStyle) => {
						if (outputStyle === selected.outputStyle) {
							return
						}
						roster.controller.restyle(selected.id, outputStyle)
						chat.controller.redescribe(selected.id)
					}}
					onValueChange={(value) => {
						roster.controller.describe(selected.id, value)
						if (changesRuntime(selected, value)) {
							chat.controller.redescribe(selected.id)
						}
					}}
					onMcpServerChange={mcpServers.controller.rename}
					onMcpServerCreate={mcpServers.controller.create}
					onMcpServerDelete={mcpServers.controller.remove}
					onSkillChange={(id, draft) =>
						skills.controller.save(
							id,
							toSkillDraft(
								draft,
								skills.state.skills.find((skill) => skill.id === id),
							),
						)
					}
					onSkillCreate={(draft, isPreloaded) =>
						skills.controller.create(toSkillDraft(draft), isPreloaded)
					}
					onSkillDelete={skills.controller.remove}
					onSkillPreloadedChange={skills.controller.setPreloaded}
					open={isEditing}
					seed={selected.id}
					skills={skills.state.skills.map(toSkillItem)}
					showDanger={isShowingDanger}
					value={toSettingsValue(selected)}
					working={activity?.isWorking ?? false}
					workingKind={activity?.kind}
				/>
			) : null}
			<UserSettingsDialog
				onClose={() => user.controller.setSettingsOpen(false)}
				language={language}
				onLanguageChange={(next) => {
					setLanguage(next)
					void storeLanguage(next)
				}}
				onPictureRemove={() => {
					void user.controller.removePicture()
				}}
				onPictureUpload={(file) => {
					void user.controller.uploadPicture(file)
				}}
				onValueChange={(value) => {
					if (value.name !== userSettings.name) {
						user.controller.rename(value.name)
					}
					if (value.colorScheme !== userSettings.colorScheme) {
						theme.setTheme(value.colorScheme)
					}
					if (value.palette !== userSettings.palette) {
						theme.setPalette(value.palette)
					}
					const notification = toNotificationChange(value, userSettings)
					if (notification) {
						void user.controller.setNotification(notification)
					}
				}}
				open={user.state.isSettingsOpen}
				value={userSettings}
			/>
		</>
	)
}
