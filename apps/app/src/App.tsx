import { useCallback, useEffect, useMemo, useState } from "react"

import { AppSidebar } from "@workspace/ui/components/app-sidebar"
import { readBotOutputStyle } from "@workspace/ui/components/bot-settings"
import { BotSettingsDialog } from "@workspace/ui/components/bot-settings-dialog"
import { ConversationSettingsDialog } from "@workspace/ui/components/conversation-settings-dialog"
import { NewConversationDialog } from "@workspace/ui/components/new-conversation-dialog"
import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import { SpaceSettingsDialog } from "@workspace/ui/components/space-settings-dialog"
import { UpdateBadge } from "@workspace/ui/components/update-badge"
import { UserSettingsDialog } from "@workspace/ui/components/user-settings-dialog"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"
import { useSettingsShortcut } from "@workspace/ui/hooks/use-settings-shortcut"
import { probeRender } from "@workspace/ui/lib/render-probe"

import { StartupScreen } from "@/components/startup-screen"
import { WorkspaceBody } from "@/components/workspace-body"
import {
	changesRuntime,
	modelOptionsFor,
	toCommitItem,
	toRosterBots,
	toSettingsValue,
} from "@/lib/bots/bot-settings"
import { toSkillDraft, toSkillFiles, toSkillItem } from "@/lib/bots/skill-draft"
import { useBotHistory } from "@/lib/bots/use-bot-history"
import { useBotSkills } from "@/lib/bots/use-bot-skills"
import { useEvolution } from "@/lib/bots/use-evolution"
import { useMcpServers } from "@/lib/bots/use-mcp-servers"
import { useModelCatalogue } from "@/lib/bots/use-model-catalogue"
import { useRoster } from "@/lib/bots/use-roster"
import { useRosterClock } from "@/lib/bots/use-roster-clock"
import { createAttachmentsController } from "@/lib/chat/attachments-controller"
import { createAttachmentsPort } from "@/lib/chat/attachments-port"
import { createChatDriver } from "@/lib/chat/create-driver"
import { createDraftsController } from "@/lib/chat/drafts-controller"
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
import type { EnvScope } from "@/lib/conversations/store-contract"
import {
	useConversationPreviews,
	useConversationWorkers,
} from "@/lib/conversations/use-conversation"
import { useConversationBadges } from "@/lib/conversations/use-conversation-badges"
import { toEnvironmentRows } from "@/lib/environment/environment-rows"
import { useEnvironment } from "@/lib/environment/use-environment"
import { hasOverlayWindowControls, isSidebarResizable } from "@/lib/host"
import { useExternalLinks } from "@/lib/links/use-external-links"
import { useNotifications } from "@/lib/notifications/use-notifications"
import { useRunDriver } from "@/lib/routines/use-run-driver"
import { useCollapsedSections } from "@/lib/sections/use-collapsed-sections"
import { useSections } from "@/lib/sections/use-sections"
import { useSidebarActions } from "@/lib/sidebar/use-sidebar-actions"
import { toSpaceSettingsValue } from "@/lib/spaces/space-settings"
import { useSpaceEntry } from "@/lib/spaces/use-space-entry"
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
	probeRender("App")
	const driver = useMemo(createChatDriver, [])
	const store = useMemo(createTranscriptStore, [])
	const chat = useChat(driver, store)
	const roster = useRoster(store)
	const conversationRuntimes = useMemo(
		() =>
			createConversationRuntimes(driver, store, {
				onNamed: roster.controller.nameConversation,
			}),
		[driver, store, roster.controller],
	)

	useEffect(
		() => () => {
			void conversationRuntimes.shutdown()
		},
		[conversationRuntimes],
	)

	const attachments = useMemo(
		() =>
			createAttachmentsController(
				createAttachmentsPort({
					chat: chat.controller,
					driver,
					runtimes: conversationRuntimes,
				}),
			),
		[chat.controller, driver, conversationRuntimes],
	)
	const drafts = useMemo(createDraftsController, [])
	const sections = useSections(store, {
		move: roster.controller.moveToSection,
		clear: roster.controller.clearSection,
		pin: roster.controller.pin,
	})
	const collapsedSections = useCollapsedSections(store)
	const skills = useBotSkills(store)
	const botMcpServers = useMcpServers(store)
	const spaceMcpServers = useMcpServers(store)
	const botEnvironment = useEnvironment(store)
	const spaceEnvironment = useEnvironment(store)
	const serverEnvironment = useEnvironment(store)
	const history = useBotHistory(store)
	const catalogue = useModelCatalogue()
	const user = useUser()
	const userPlugin = useUserPlugin(store)
	const spaces = useSpaces(store)
	const spacePlugin = useSpacePlugin(store)
	const preferences = user.state.preferences

	const updater = useUpdater()

	useExternalLinks()

	useRunDriver({ driver, store, runtimes: conversationRuntimes })

	useNotifications({
		chat: chat.controller,
		runtimes: conversationRuntimes,
		roster: roster.controller,
		spaces: spaces.controller,
		user: user.controller,
	})

	useEvolution({
		driver,
		roster: roster.controller,
		skills: skills.controller,
		history: history.controller,
		userPlugin: userPlugin.controller,
		spacePlugin: spacePlugin.controller,
	})

	const badges = useBotBadges({
		chat: chat.controller,
		roster: roster.controller,
	})

	const conversationBadges = useConversationBadges({
		runtimes: conversationRuntimes,
		roster: roster.controller,
	})

	const {
		bots,
		conversations,
		selectedBotId,
		selectedConversationId,
		settingsBotId,
		settingsConversationId,
		isEditing,
		isShowingDanger,
		isEditingConversation,
		hasLoaded,
	} = roster.state
	const selected = bots.find((bot) => bot.id === selectedBotId)
	const selectedConversation = conversations.find(
		(conversation) => conversation.id === selectedConversationId,
	)
	const settingsBot = bots.find((bot) => bot.id === settingsBotId)
	const settingsConversation = conversations.find(
		(conversation) => conversation.id === settingsConversationId,
	)
	const [isCreatingConversation, setIsCreatingConversation] = useState(false)
	const [openedMcpServer, setOpenedMcpServer] = useState<EnvScope | null>(null)

	const { selectedSpaceId, isSettingsOpen: isSpaceEditing } = spaces.state
	const selectedSpace = spaces.state.spaces.find(
		(space) => space.id === selectedSpaceId,
	)

	const listedSpaces = spaces.state.spaces.map((space) => space.id).join(" ")
	const spaceIds = useMemo(
		() => (listedSpaces === "" ? [] : listedSpaces.split(" ")),
		[listedSpaces],
	)

	const loadSpaces = useCallback(() => {
		void spaces.controller.load(
			user.controller.getState().preferences.lastSpaceId,
		)
	}, [spaces.controller, user.controller])

	useEffect(() => {
		loadSpaces()
	}, [loadSpaces])

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

	useSpaceEntry({
		roster: roster.controller,
		user: user.controller,
		selectedSpaceId,
	})

	useEffect(() => {
		void user.controller.load()
		return user.controller.followOtherWindows()
	}, [user.controller])

	useEffect(() => {
		if (!settingsBotId || !selectedSpaceId) {
			return
		}
		const scope = {
			kind: "bot",
			id: settingsBotId,
			spaceId: selectedSpaceId,
		} as const
		void skills.controller.open(settingsBotId)
		void botMcpServers.controller.open(scope)
		void botEnvironment.controller.open(scope)
		void history.controller.open(settingsBotId)
	}, [
		history.controller,
		botEnvironment.controller,
		botMcpServers.controller,
		skills.controller,
		settingsBotId,
		selectedSpaceId,
	])

	useEffect(() => {
		if (isSpaceEditing && selectedSpaceId) {
			void spaceEnvironment.controller.open({
				kind: "space",
				id: selectedSpaceId,
			})
			void spaceMcpServers.controller.open({
				kind: "space",
				id: selectedSpaceId,
			})
		}
	}, [
		spaceEnvironment.controller,
		spaceMcpServers.controller,
		isSpaceEditing,
		selectedSpaceId,
	])

	useEffect(() => {
		if (openedMcpServer) {
			void serverEnvironment.controller.open(openedMcpServer)
		}
	}, [serverEnvironment.controller, openedMcpServer])

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

	const startConversation = useCallback(
		() => setIsCreatingConversation(true),
		[],
	)

	const sidebarActions = useSidebarActions({
		attachments,
		chat: chat.controller,
		collapsedSections: collapsedSections.controller,
		drafts,
		roster: roster.controller,
		runtimes: conversationRuntimes,
		sections: sections.controller,
		spacePlugin: spacePlugin.controller,
		spaces: spaces.controller,
		user: user.controller,
		userPlugin: userPlugin.controller,
	})

	const deleteBot = async (id: string) => {
		await chat.controller.close(id)
		attachments.forget({ kind: "bot", id })
		drafts.forget(id)
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
	const activity = settingsBotId ? working[settingsBotId] : undefined

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
	const rosterBots = useMemo(() => {
		probeRender("rosterBots")
		return withBadges(toRosterBots(bots, { working, previews }, now), badges)
	}, [bots, working, previews, now, badges])

	const listedRosters = Object.keys(rosters).join(" ")

	useEffect(() => {
		const rosteredSpaceIds =
			listedRosters === "" ? [] : listedRosters.split(" ")
		sections.controller.keep(rosteredSpaceIds)
		collapsedSections.controller.keep(rosteredSpaceIds)
		const held = sections.controller.getState().sections
		for (const spaceId of rosteredSpaceIds) {
			if (!held[spaceId]) {
				void sections.controller.enter(spaceId)
				void collapsedSections.controller.enter(spaceId)
			}
		}
	}, [sections.controller, collapsedSections.controller, listedRosters])

	const collapsedSectionIds = useMemo(
		() => Object.values(collapsedSections.state.collapsedBySpaceId).flat(),
		[collapsedSections.state.collapsedBySpaceId],
	)

	const rosterBotsBySpace = useMemo(() => {
		probeRender("rosterBotsBySpace")
		return Object.fromEntries(
			Object.entries(rosters).map(([spaceId, spaceBots]) => [
				spaceId,
				withBadges(toRosterBots(spaceBots, { working, previews }, now), badges),
			]),
		)
	}, [rosters, working, previews, now, badges])

	const conversationRosters = roster.state.conversationRosters

	const conversationIds = useMemo(
		() =>
			Object.values(conversationRosters)
				.flat()
				.map((conversation) => conversation.id),
		[conversationRosters],
	)

	const conversationWorkers = useConversationWorkers(
		conversationRuntimes,
		conversationIds,
	)

	const conversationPreviews = useConversationPreviews(
		conversationRuntimes,
		conversationIds,
		roster.state.conversationPreviews,
	)

	const rosterConversations = useMemo(
		() =>
			withBadges(
				toRosterConversations(
					conversations,
					{ working: conversationWorkers, previews: conversationPreviews },
					now,
				),
				conversationBadges,
			),
		[
			conversations,
			conversationWorkers,
			conversationPreviews,
			now,
			conversationBadges,
		],
	)

	const seatedBots = useMemo(
		() =>
			settingsConversation
				? toConversationBots(presentParticipants(settingsConversation))
				: [],
		[settingsConversation],
	)

	const recruitableBots = useMemo(
		() =>
			settingsConversation ? unseatedBots(bots, settingsConversation) : [],
		[bots, settingsConversation],
	)

	const rosterConversationsBySpace = useMemo(
		() =>
			Object.fromEntries(
				Object.entries(conversationRosters).map(([spaceId, spaceRooms]) => [
					spaceId,
					withBadges(
						toRosterConversations(
							spaceRooms,
							{ working: conversationWorkers, previews: conversationPreviews },
							now,
						),
						conversationBadges,
					),
				]),
			),
		[
			conversationRosters,
			conversationWorkers,
			conversationPreviews,
			now,
			conversationBadges,
		],
	)

	const badgesBySpaceId = useMemo(
		() => toSpaceBadges(rosterBotsBySpace, rosterConversationsBySpace),
		[rosterBotsBySpace, rosterConversationsBySpace],
	)

	const isOverlayOpen =
		isEditing ||
		isEditingConversation ||
		user.state.isSettingsOpen ||
		isSpaceEditing ||
		isCreatingConversation

	const isThreadSettingsOpen = isEditing && settingsBotId === selectedBotId

	const isThreadConversationSettingsOpen =
		isEditingConversation && settingsConversationId === selectedConversationId

	const toggleSettings = useCallback(() => {
		if (isThreadSettingsOpen) {
			roster.controller.setEditing(false)
			return
		}
		if (selectedBotId) {
			roster.controller.edit(selectedBotId)
		}
	}, [roster.controller, isThreadSettingsOpen, selectedBotId])

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
		onColorSchemeChange: changeColorScheme,
	})

	useSettingsShortcut({
		isEnabled: Boolean(selected) && !isEditing,
		onToggle: toggleSettings,
	})

	if (!hasLoaded) {
		return (
			<StartupScreen
				haveSpacesFailed={spaces.state.hasFailedToLoad}
				onRetrySpaces={loadSpaces}
			/>
		)
	}

	return (
		<>
			<WorkspaceShell
				defaultOpen
				spaceTint={selectedSpace?.colour}
				width={preferences.sidebarWidth ?? undefined}
				onWidthChange={changeSidebarWidth}
				isResizable={isSidebarResizable()}
				sidebar={
					<AppSidebar
						data-tauri-drag-region="deep"
						insetWindowControls={hasOverlayWindowControls()}
						bots={rosterBots}
						haveBotsFailedToLoad={roster.state.hasFailedToLoad}
						botsBySpaceId={rosterBotsBySpace}
						conversations={rosterConversations}
						conversationsBySpaceId={rosterConversationsBySpace}
						badgesBySpaceId={badgesBySpaceId}
						collapsedSectionIds={collapsedSectionIds}
						sectionsBySpaceId={sections.state.sections}
						footer={updateBadge}
						isSpaceSwitchingEnabled={!isOverlayOpen}
						{...sidebarActions}
						onCreateConversation={startConversation}
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
					bots={bots}
					chat={chat}
					conversation={selectedConversation}
					conversationRuntimes={conversationRuntimes}
					drafts={drafts}
					haveSpacesFailed={spaces.state.hasFailedToLoad}
					isConversationSettingsOpen={isThreadConversationSettingsOpen}
					isOverlayOpen={isOverlayOpen}
					isSettingsOpen={isThreadSettingsOpen}
					onOpenConversationSettings={roster.controller.editConversation}
					onRetrySpaces={loadSpaces}
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
			{settingsBot ? (
				<BotSettingsDialog
					history={{
						commits: history.state.commits.map(toCommitItem),
						haveFailedToLoad: history.state.hasFailedToLoad,
						onLoadDiff: history.controller.loadDiff,
						onRevert: (commitId) => {
							history.controller.revert(commitId)
							chat.controller.redescribe(settingsBot.id)
						},
					}}
					haveMcpServersFailedToLoad={botMcpServers.state.hasFailedToLoad}
					mcpServers={botMcpServers.state.servers}
					environment={toEnvironmentRows(botEnvironment.state.entries)}
					hasEnvironmentFailedToRead={botEnvironment.state.hasFailedToRead}
					onEnvironmentSet={({ name, value }) =>
						botEnvironment.controller.set(name, value)
					}
					onEnvironmentDelete={botEnvironment.controller.remove}
					onMcpServerOpen={(name) =>
						setOpenedMcpServer(
							name && selectedSpaceId
								? {
										kind: "server",
										name,
										owner: {
											kind: "bot",
											id: settingsBot.id,
											spaceId: selectedSpaceId,
										},
									}
								: null,
						)
					}
					serverEnvironment={{
						entries: toEnvironmentRows(serverEnvironment.state.entries),
						hasFailedToRead: serverEnvironment.state.hasFailedToRead,
						onSet: ({ name, value }) =>
							serverEnvironment.controller.set(name, value),
						onDelete: serverEnvironment.controller.remove,
					}}
					models={modelOptionsFor(settingsBot.model, catalogue)}
					outputStyle={readBotOutputStyle(settingsBot.outputStyle)}
					memory={settingsBot.memory}
					onMemoryChange={(memory) => {
						void roster.controller.remember(settingsBot.id, memory)
					}}
					onAvatarUpload={(file) => {
						void roster.controller.uploadAvatar(settingsBot.id, file)
					}}
					onBrowseWorkingDirectory={browseWorkingDirectory}
					onClose={() => roster.controller.setEditing(false)}
					onDelete={() => {
						void deleteBot(settingsBot.id)
					}}
					onOutputStyleChange={(outputStyle) => {
						if (outputStyle === settingsBot.outputStyle) {
							return
						}
						roster.controller.restyle(settingsBot.id, outputStyle)
						chat.controller.redescribe(settingsBot.id)
					}}
					onValueChange={(value) => {
						roster.controller.describe(settingsBot.id, value)
						if (changesRuntime(settingsBot, value)) {
							chat.controller.redescribe(settingsBot.id)
						}
					}}
					onMcpServerChange={botMcpServers.controller.rename}
					onMcpServerCreate={botMcpServers.controller.create}
					onMcpServerDelete={botMcpServers.controller.remove}
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
					seed={settingsBot.id}
					skillFiles={toSkillFiles(
						skills.state.skills,
						skills.state.file,
						skills.controller,
					)}
					skills={skills.state.skills.map(toSkillItem)}
					showDanger={isShowingDanger}
					value={toSettingsValue(settingsBot)}
					working={activity?.isWorking ?? false}
					workingKind={activity?.kind}
				/>
			) : null}
			{settingsConversation ? (
				<ConversationSettingsDialog
					bots={recruitableBots}
					leadId={leadOf(settingsConversation) ?? ""}
					onClose={() => roster.controller.setConversationEditing(false)}
					onDelete={() => {
						void sidebarActions.onDeleteConversation(settingsConversation.id)
					}}
					onDismiss={(botId) => {
						void roster.controller.dismissFromConversation(
							settingsConversation.id,
							botId,
						)
					}}
					onLeadChange={(botId) => {
						void roster.controller.setConversationLead(
							settingsConversation.id,
							botId,
						)
					}}
					onRecruit={(botId) => {
						void roster.controller.recruitToConversation(
							settingsConversation.id,
							botId,
						)
					}}
					onValueChange={(value) =>
						roster.controller.describeConversation(
							settingsConversation.id,
							value,
						)
					}
					open={isEditingConversation}
					participants={seatedBots}
					value={toConversationSettingsValue(settingsConversation)}
				/>
			) : null}
			{selectedSpace ? (
				<SpaceSettingsDialog
					environment={toEnvironmentRows(spaceEnvironment.state.entries)}
					hasEnvironmentFailedToRead={spaceEnvironment.state.hasFailedToRead}
					haveMcpServersFailedToLoad={spaceMcpServers.state.hasFailedToLoad}
					mcpServers={spaceMcpServers.state.servers}
					onMcpServerChange={spaceMcpServers.controller.rename}
					onMcpServerCreate={spaceMcpServers.controller.create}
					onMcpServerDelete={spaceMcpServers.controller.remove}
					onMcpServerOpen={(name) =>
						setOpenedMcpServer(
							name
								? {
										kind: "server",
										name,
										owner: { kind: "space", id: selectedSpace.id },
									}
								: null,
						)
					}
					serverEnvironment={{
						entries: toEnvironmentRows(serverEnvironment.state.entries),
						hasFailedToRead: serverEnvironment.state.hasFailedToRead,
						onSet: ({ name, value }) =>
							serverEnvironment.controller.set(name, value),
						onDelete: serverEnvironment.controller.remove,
					}}
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
					onEnvironmentDelete={spaceEnvironment.controller.remove}
					onEnvironmentSet={({ name, value }) =>
						spaceEnvironment.controller.set(name, value)
					}
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
					skillFiles={toSkillFiles(
						spacePlugin.state.skills,
						spacePlugin.state.file,
						spacePlugin.controller,
					)}
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
				skillFiles={toSkillFiles(
					userPlugin.state.skills,
					userPlugin.state.file,
					userPlugin.controller,
				)}
				skills={userPlugin.state.skills.map(toSkillItem)}
				value={userSettings}
			/>
			<NoticeSurface />
		</>
	)
}
