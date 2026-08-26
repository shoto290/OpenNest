import { useCallback, useEffect, useMemo, useState } from "react"

import { AgentSidebar } from "@workspace/ui/components/agents/agent-sidebar"
import { readBotOutputStyle } from "@workspace/ui/components/bot-settings"
import { BotSettingsDialog } from "@workspace/ui/components/bot-settings-dialog"
import { ConversationSettingsDialog } from "@workspace/ui/components/conversation-settings-dialog"
import { NewConversationDialog } from "@workspace/ui/components/new-conversation-dialog"
import { SpaceSettingsDialog } from "@workspace/ui/components/space-settings-dialog"
import { UpdateBadge } from "@workspace/ui/components/update-badge"
import { UserSettingsDialog } from "@workspace/ui/components/user-settings-dialog"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"
import { useSettingsShortcut } from "@workspace/ui/hooks/use-settings-shortcut"

import { WorkspaceBody } from "@/components/workspace-body"
import {
	changesRuntime,
	modelOptionsFor,
	toCommitItem,
	toRosterBots,
	toSettingsValue,
} from "@/lib/bots/bot-settings"
import { moveBotToSpace } from "@/lib/bots/bot-space-move"
import { toSkillDraft, toSkillItem } from "@/lib/bots/skill-draft"
import { useBotHistory } from "@/lib/bots/use-bot-history"
import { useBotMcpServers } from "@/lib/bots/use-bot-mcp-servers"
import { useBotSkills } from "@/lib/bots/use-bot-skills"
import { useModelCatalogue } from "@/lib/bots/use-model-catalogue"
import { useRoster } from "@/lib/bots/use-roster"
import { useRosterClock } from "@/lib/bots/use-roster-clock"
import { createAttachmentsController } from "@/lib/chat/attachments-controller"
import { createChatDriver } from "@/lib/chat/create-driver"
import { toSpaceBadges, withBadges } from "@/lib/chat/sidebar-badges"
import { useBotBadges } from "@/lib/chat/use-bot-badges"
import { useBotActivity, useBotPreviews, useChat } from "@/lib/chat/use-chat"
import { createConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import { createTranscriptStore } from "@/lib/conversations/create-store"
import {
	leadOf,
	presentParticipants,
	toConversationBots,
	toConversationSettingsValue,
	toRosterConversations,
	unseatedBots,
} from "@/lib/conversations/roster-conversations"
import { hasOverlayWindowControls, isSidebarResizable } from "@/lib/host"
import { useExternalLinks } from "@/lib/links/use-external-links"
import { useNotifications } from "@/lib/notifications/use-notifications"
import { spaceForNewSection } from "@/lib/sections/section-space"
import { spaceOfSection } from "@/lib/sections/sections-controller"
import { useSections } from "@/lib/sections/use-sections"
import { toSpaceSettingsValue } from "@/lib/spaces/space-settings"
import { useSpacePlugin } from "@/lib/spaces/use-space-plugin"
import { useSpaces } from "@/lib/spaces/use-spaces"
import { useTheme } from "@/lib/theme/use-theme"
import { toUpdateBadgeProps } from "@/lib/updater/badge-model"
import { useUpdater } from "@/lib/updater/use-updater"
import type { ColorScheme } from "@/lib/user/preferences-contract"
import { lastBotIn } from "@/lib/user/preferences-mirror"
import { useUser } from "@/lib/user/use-user"
import { useUserPlugin } from "@/lib/user/use-user-plugin"
import {
	toNotificationChange,
	toUserSettingsValue,
} from "@/lib/user/user-settings"

const browseWorkingDirectory = () => undefined

export function App() {
	const driver = useMemo(createChatDriver, [])
	const store = useMemo(createTranscriptStore, [])
	const chat = useChat(driver, store)
	const conversationRuntimes = useMemo(
		() => createConversationRuntimes(driver, store),
		[driver, store],
	)

	useEffect(
		() => () => {
			void conversationRuntimes.shutdown()
		},
		[conversationRuntimes],
	)

	const attachments = useMemo(
		() =>
			createAttachmentsController({
				store: chat.controller.storeAttachments,
				send: chat.controller.sendTo,
			}),
		[chat.controller],
	)
	const roster = useRoster(store)
	const sections = useSections(store, {
		move: roster.controller.moveToSection,
		clear: roster.controller.clearSection,
	})
	const skills = useBotSkills(store)
	const mcpServers = useBotMcpServers(store)
	const history = useBotHistory(store)
	const catalogue = useModelCatalogue()
	const user = useUser()
	const userPlugin = useUserPlugin(store)
	const spaces = useSpaces(store)
	const spacePlugin = useSpacePlugin(store)
	const preferences = user.state.preferences

	const updater = useUpdater()

	useExternalLinks()

	useNotifications({
		chat: chat.controller,
		roster: roster.controller,
		user: user.controller,
	})

	const badges = useBotBadges({
		chat: chat.controller,
		roster: roster.controller,
	})

	const {
		bots,
		conversations,
		selectedBotId,
		selectedConversationId,
		isEditing,
		isShowingDanger,
		isEditingConversation,
		hasLoaded,
	} = roster.state
	const selected = bots.find((bot) => bot.id === selectedBotId)
	const selectedConversation = conversations.find(
		(conversation) => conversation.id === selectedConversationId,
	)
	const [isCreatingConversation, setIsCreatingConversation] = useState(false)

	const { selectedSpaceId, isSettingsOpen: isSpaceEditing } = spaces.state
	const selectedSpace = spaces.state.spaces.find(
		(space) => space.id === selectedSpaceId,
	)

	const listedSpaces = spaces.state.spaces.map((space) => space.id).join(" ")
	const spaceIds = useMemo(
		() => (listedSpaces === "" ? [] : listedSpaces.split(" ")),
		[listedSpaces],
	)

	useEffect(() => {
		void spaces.controller.load(
			user.controller.getState().preferences.lastSpaceId,
		)
	}, [spaces.controller, user.controller])

	useEffect(() => {
		if (spaceIds.length === 0) {
			return
		}
		const spaceId = spaces.controller.getState().selectedSpaceId
		void roster.controller.load({
			spaceIds,
			spaceId,
			lastRowId: lastBotIn(user.controller.getState().preferences, spaceId),
		})
	}, [roster.controller, spaces.controller, user.controller, spaceIds])

	useEffect(() => {
		if (!selectedSpaceId) {
			return
		}
		void user.controller.setLastSpace(selectedSpaceId)
		roster.controller.enter({
			spaceId: selectedSpaceId,
			lastRowId: lastBotIn(
				user.controller.getState().preferences,
				selectedSpaceId,
			),
		})
	}, [roster.controller, user.controller, selectedSpaceId])

	useEffect(() => {
		void user.controller.load()
		return user.controller.followOtherWindows()
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
		if (!selectedBotId) {
			return
		}
		void chat.controller.open(selectedBotId)
		void user.controller.setLastBot({
			spaceId: roster.controller.getState().spaceId,
			botId: selectedBotId,
		})
	}, [chat.controller, roster.controller, user.controller, selectedBotId])

	useEffect(() => {
		if (!selectedConversationId) {
			return
		}
		void user.controller.setLastBot({
			spaceId: roster.controller.getState().spaceId,
			botId: selectedConversationId,
		})
	}, [roster.controller, user.controller, selectedConversationId])

	const rosters = roster.state.rosters

	const createSection = (name: string, botId?: string) => {
		const spaceId = spaceForNewSection({
			rosters,
			shownSpaceId: selectedSpaceId,
			botId,
		})
		if (!spaceId) {
			return
		}
		void sections.controller.create(spaceId, name, botId ?? null)
	}

	const reorderSections = (ids: string[]) => {
		const spaceId =
			ids.length > 0 ? spaceOfSection(sections.state, ids[0]) : undefined
		if (spaceId) {
			void sections.controller.reorder(spaceId, ids)
		}
	}

	const moveToSpace = (botId: string, spaceId: string) =>
		moveBotToSpace({
			botId,
			spaceId,
			roster: roster.controller,
			chat: chat.controller,
			spaces: spaces.controller,
		})

	const deleteBot = async (id: string) => {
		await chat.controller.close(id)
		attachments.forget(id)
		await roster.controller.remove(id)
	}

	const botIds = useMemo(
		() =>
			Object.values(rosters).flatMap((spaceBots) =>
				spaceBots.map((bot) => bot.id),
			),
		[rosters],
	)
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
		() => withBadges(toRosterBots(bots, { working, previews }, now), badges),
		[bots, working, previews, now, badges],
	)

	const listedRosters = Object.keys(rosters).join(" ")

	useEffect(() => {
		const rosteredSpaceIds =
			listedRosters === "" ? [] : listedRosters.split(" ")
		sections.controller.keep(rosteredSpaceIds)
		const held = sections.controller.getState().sections
		for (const spaceId of rosteredSpaceIds) {
			if (!held[spaceId]) {
				void sections.controller.enter(spaceId)
			}
		}
	}, [sections.controller, listedRosters])

	const rosterBotsBySpace = useMemo(
		() =>
			Object.fromEntries(
				Object.entries(rosters).map(([spaceId, spaceBots]) => [
					spaceId,
					withBadges(
						toRosterBots(spaceBots, { working, previews }, now),
						badges,
					),
				]),
			),
		[rosters, working, previews, now, badges],
	)

	const badgesBySpaceId = useMemo(
		() => toSpaceBadges(rosterBotsBySpace),
		[rosterBotsBySpace],
	)

	const conversationRosters = roster.state.conversationRosters

	const conversationPreviews = roster.state.conversationPreviews

	const rosterConversations = useMemo(
		() => toRosterConversations(conversations, conversationPreviews, now),
		[conversations, conversationPreviews, now],
	)

	const seatedBots = useMemo(
		() =>
			selectedConversation
				? toConversationBots(presentParticipants(selectedConversation))
				: [],
		[selectedConversation],
	)

	const recruitableBots = useMemo(
		() =>
			selectedConversation ? unseatedBots(bots, selectedConversation) : [],
		[bots, selectedConversation],
	)

	const rosterConversationsBySpace = useMemo(
		() =>
			Object.fromEntries(
				Object.entries(conversationRosters).map(([spaceId, spaceRooms]) => [
					spaceId,
					toRosterConversations(spaceRooms, conversationPreviews, now),
				]),
			),
		[conversationRosters, conversationPreviews, now],
	)

	const isOverlayOpen =
		isEditing ||
		isEditingConversation ||
		user.state.isSettingsOpen ||
		isSpaceEditing ||
		isCreatingConversation

	const toggleSettings = useCallback(
		() => roster.controller.setEditing(!isEditing),
		[roster.controller, isEditing],
	)

	const userSettings = useMemo(
		() => toUserSettingsValue(preferences),
		[preferences],
	)

	const changeSidebarWidth = useCallback(
		(sidebarWidth: number) => {
			void user.controller.setSidebarWidth(sidebarWidth)
		},
		[user.controller],
	)

	const changeColorScheme = useCallback(
		(colorScheme: ColorScheme) => {
			void user.controller.setColorScheme(colorScheme)
		},
		[user.controller],
	)

	useTheme({
		colorScheme: preferences.colorScheme,
		palette: preferences.palette,
		onColorSchemeChange: changeColorScheme,
	})

	useSettingsShortcut({
		isEnabled: Boolean(selected) && !isEditing,
		onToggle: toggleSettings,
	})

	return (
		<>
			<WorkspaceShell
				defaultOpen
				width={preferences.sidebarWidth ?? undefined}
				onWidthChange={changeSidebarWidth}
				isResizable={isSidebarResizable()}
				sidebar={
					<AgentSidebar
						data-tauri-drag-region="deep"
						insetWindowControls={hasOverlayWindowControls()}
						bots={rosterBots}
						botsBySpaceId={rosterBotsBySpace}
						conversations={rosterConversations}
						conversationsBySpaceId={rosterConversationsBySpace}
						badgesBySpaceId={badgesBySpaceId}
						sectionsBySpaceId={sections.state.sections}
						footer={updateBadge}
						isSpaceSwitchingEnabled={!isOverlayOpen}
						onCreateBot={() => {
							void roster.controller.create()
						}}
						onCreateConversation={() => setIsCreatingConversation(true)}
						onDeleteConversation={(id) => {
							void roster.controller.removeConversation(id)
						}}
						onMoveConversationToSection={(id, sectionId) => {
							void roster.controller.moveConversationToSection(id, sectionId)
						}}
						onOpenConversationSettings={roster.controller.editConversation}
						onSelectConversation={roster.controller.selectConversation}
						onDeleteBot={roster.controller.askToDelete}
						onDuplicateBot={(id) => {
							void roster.controller.duplicate(id)
						}}
						onDuplicateBotToSpace={(id, spaceId) => {
							void roster.controller.duplicate(id, spaceId).then((copy) => {
								if (copy) {
									spaces.controller.select(spaceId)
								}
							})
						}}
						onEditBot={roster.controller.edit}
						onCreateSection={createSection}
						onRenameSection={sections.controller.rename}
						onReorderSections={reorderSections}
						onDeleteSection={(id) => {
							void sections.controller.remove(id)
						}}
						onMoveBotToSpace={(botId, spaceId) => {
							void moveToSpace(botId, spaceId)
						}}
						onMoveBotToSection={(botId, sectionId) => {
							void sections.controller.moveBot(botId, sectionId)
						}}
						onOpenUserSettings={() => {
							user.controller.setSettingsOpen(true)
							void userPlugin.controller.open()
						}}
						onCreateSpace={() => {
							void spaces.controller.create()
						}}
						onOpenSpaceSettings={() => {
							spaces.controller.setSettingsOpen(true)
							if (selectedSpaceId) {
								void spacePlugin.controller.open(selectedSpaceId)
							}
						}}
						onReorderSpaces={(ids) => {
							void spaces.controller.reorder(ids)
						}}
						onSelectBot={roster.controller.select}
						onSelectSpace={spaces.controller.select}
						selectedBotId={selectedBotId ?? undefined}
						selectedConversationId={selectedConversationId ?? undefined}
						selectedSpaceId={selectedSpaceId ?? undefined}
						spaces={spaces.state.spaces}
						user={userSettings}
					/>
				}
			>
				<WorkspaceBody
					attachments={attachments}
					bot={selected}
					chat={chat}
					conversation={selectedConversation}
					conversationRuntimes={conversationRuntimes}
					hasLoaded={hasLoaded}
					isConversationSettingsOpen={isEditingConversation}
					isOverlayOpen={isOverlayOpen}
					isSettingsOpen={isEditing}
					onOpenConversationSettings={roster.controller.editConversation}
					onToggleSettings={toggleSettings}
					readerName={preferences.displayName}
				/>
			</WorkspaceShell>
			<NewConversationDialog
				bots={rosterBots}
				onClose={() => setIsCreatingConversation(false)}
				onCreate={({ name, botIds }) => {
					setIsCreatingConversation(false)
					void roster.controller.createConversation({ title: name, botIds })
				}}
				open={isCreatingConversation}
			/>
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
			{selectedConversation ? (
				<ConversationSettingsDialog
					bots={recruitableBots}
					leadId={leadOf(selectedConversation) ?? ""}
					onClose={() => roster.controller.setConversationEditing(false)}
					onDelete={() => {
						void roster.controller.removeConversation(selectedConversation.id)
					}}
					onDismiss={(botId) => {
						void roster.controller.dismissFromConversation(
							selectedConversation.id,
							botId,
						)
					}}
					onLeadChange={(botId) => {
						void roster.controller.setConversationLead(
							selectedConversation.id,
							botId,
						)
					}}
					onRecruit={(botId) => {
						void roster.controller.recruitToConversation(
							selectedConversation.id,
							botId,
						)
					}}
					onValueChange={(value) =>
						roster.controller.describeConversation(
							selectedConversation.id,
							value,
						)
					}
					open={isEditingConversation}
					participants={seatedBots}
					value={toConversationSettingsValue(selectedConversation)}
				/>
			) : null}
			{selectedSpace ? (
				<SpaceSettingsDialog
					history={{
						commits: spacePlugin.state.commits.map(toCommitItem),
						onLoadDiff: spacePlugin.controller.loadDiff,
						onRevert: spacePlugin.controller.revert,
					}}
					isDeletable={spaces.state.spaces.length > 1}
					onClose={() => spaces.controller.setSettingsOpen(false)}
					onDelete={() => {
						void spaces.controller.remove(selectedSpace.id)
					}}
					onSkillChange={(id, draft) =>
						spacePlugin.controller.saveSkill(
							id,
							toSkillDraft(
								draft,
								spacePlugin.state.skills.find((skill) => skill.id === id),
							),
						)
					}
					onSkillCreate={(draft, isPreloaded) =>
						spacePlugin.controller.createSkill(toSkillDraft(draft), isPreloaded)
					}
					onSkillDelete={spacePlugin.controller.removeSkill}
					onSkillPreloadedChange={spacePlugin.controller.setSkillPreloaded}
					onValueChange={(value) =>
						spaces.controller.describe(selectedSpace.id, value)
					}
					open={isSpaceEditing}
					skills={spacePlugin.state.skills.map(toSkillItem)}
					value={toSpaceSettingsValue(selectedSpace)}
				/>
			) : null}
			<UserSettingsDialog
				history={{
					commits: userPlugin.state.commits.map(toCommitItem),
					onLoadDiff: userPlugin.controller.loadDiff,
					onRevert: userPlugin.controller.revert,
				}}
				onClose={() => user.controller.setSettingsOpen(false)}
				language={preferences.language}
				onLanguageChange={(next) => {
					void user.controller.setLanguage(next)
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
						void user.controller.setColorScheme(value.colorScheme)
					}
					if (value.palette !== userSettings.palette) {
						void user.controller.setPalette(value.palette)
					}
					const notification = toNotificationChange(value, userSettings)
					if (notification) {
						void user.controller.setNotification(notification)
					}
				}}
				onSkillChange={(id, draft) =>
					userPlugin.controller.saveSkill(
						id,
						toSkillDraft(
							draft,
							userPlugin.state.skills.find((skill) => skill.id === id),
						),
					)
				}
				onSkillCreate={(draft, isPreloaded) =>
					userPlugin.controller.createSkill(toSkillDraft(draft), isPreloaded)
				}
				onSkillDelete={userPlugin.controller.removeSkill}
				onSkillPreloadedChange={userPlugin.controller.setSkillPreloaded}
				open={user.state.isSettingsOpen}
				skills={userPlugin.state.skills.map(toSkillItem)}
				value={userSettings}
			/>
		</>
	)
}
