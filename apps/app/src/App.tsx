import { useCallback, useEffect, useMemo, useState } from "react"

import { AgentSidebar } from "@workspace/ui/components/agents/agent-sidebar"
import { AppBootScreen } from "@workspace/ui/components/app-boot-screen"
import { AppHeader } from "@workspace/ui/components/app-header"
import { BotSettingsDialog } from "@workspace/ui/components/bot-settings-dialog"
import { UpdateBadge } from "@workspace/ui/components/update-badge"
import { UserSettingsDialog } from "@workspace/ui/components/user-settings-dialog"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

import { ChatScreen } from "@/components/chat-screen"
import { useTheme } from "@/components/theme-provider"
import {
	changesRuntime,
	modelOptionsFor,
	toRosterBots,
	toSettingsValue,
} from "@/lib/bots/bot-settings"
import { useModelCatalogue } from "@/lib/bots/use-model-catalogue"
import { useRoster } from "@/lib/bots/use-roster"
import { useRosterClock } from "@/lib/bots/use-roster-clock"
import { useSettingsShortcut } from "@/lib/bots/use-settings-shortcut"
import { createAttachmentsController } from "@/lib/chat/attachments-controller"
import { createChatDriver } from "@/lib/chat/create-driver"
import { useBotActivity, useBotPreviews, useChat } from "@/lib/chat/use-chat"
import { createTranscriptStore } from "@/lib/conversations/create-store"
import { useExternalLinks } from "@/lib/links/use-external-links"
import { toUpdateBadgeProps } from "@/lib/updater/badge-model"
import { useUpdater } from "@/lib/updater/use-updater"
import { chosenLanguage, storeLanguage } from "@/lib/user/language-mirror"
import { useUser } from "@/lib/user/use-user"
import { toUserSettingsValue } from "@/lib/user/user-settings"

/** The folder picker the working directory field opens. There is none on this
 * build: choosing a directory needs a host dialog this app does not carry yet, and
 * what a bot's runs happen in is the next ticket's. The field still shows what the
 * store holds. */
const browseWorkingDirectory = () => undefined

export function App() {
	const driver = useMemo(createChatDriver, [])
	const store = useMemo(createTranscriptStore, [])
	const chat = useChat(driver, store)

	// One composer holds files for every bot, so a switch does not take away what
	// was attached, and a submission that had to store them first still names the
	// bot it started on.
	const attachments = useMemo(
		() =>
			createAttachmentsController({
				store: chat.controller.storeAttachments,
				send: chat.controller.sendTo,
			}),
		[chat.controller],
	)
	const roster = useRoster(store)
	const catalogue = useModelCatalogue()
	const user = useUser()
	const theme = useTheme()

	// Mounted at the top of the window: the release check belongs to the app being
	// open, and the pastille under the roster is where what it found is read.
	const updater = useUpdater()

	// Mounted here for the same reason: a link is followed wherever the reader is,
	// and the window is what has to stay on the view they were reading.
	useExternalLinks()

	const { bots, selectedBotId, isEditing, isConfirmingDelete, hasLoaded } =
		roster.state
	const selected = bots.find((bot) => bot.id === selectedBotId)

	useEffect(() => {
		void roster.controller.load()
	}, [roster.controller])

	useEffect(() => {
		void user.controller.load()
	}, [user.controller])

	// The conversation follows the selection: opening a bot paints its transcript and
	// puts a process of its own behind it. Coming back to one that is already
	// answering shows it as it is — every bot keeps its runtime until it is deleted
	// or the app quits.
	useEffect(() => {
		if (selectedBotId) {
			void chat.controller.open(selectedBotId)
		}
	}, [chat.controller, selectedBotId])

	// The runtime goes first: a process left running would answer into a conversation
	// the delete is about to take away.
	const deleteBot = async (id: string) => {
		await chat.controller.close(id)
		attachments.forget(id)
		await roster.controller.remove(id)
	}

	// Every bot's own, because every bot has a process of its own and a conversation
	// of its own: the roster shows the ones answering in the background as busy, and
	// previews what each of them last said, not only the one being read.
	const botIds = useMemo(() => bots.map((bot) => bot.id), [bots])
	const working = useBotActivity(chat.controller, botIds)
	const previews = useBotPreviews(
		chat.controller,
		botIds,
		roster.state.previews,
	)
	const activity = selectedBotId ? working[selectedBotId] : undefined

	// Read off the same activity the roster is drawn from: a bot busy in the sidebar
	// is a bot a restart would interrupt.
	const busyBotCount = useMemo(
		() => Object.values(working).filter((bot) => bot.isWorking).length,
		[working],
	)

	// Held between renders for the reason the roster is: a streamed token must not
	// hand the sidebar a new footer and re-measure the column behind it. Every input
	// here settles when the download does, or when a bot starts or finishes a turn.
	const updateBadge = useMemo(
		() => (
			<UpdateBadge
				{...toUpdateBadgeProps({ state: updater.state, busyBotCount })}
				onDownload={() => {
					void updater.controller.install()
				}}
				// A restart while a bot is answering would take that answer away, and the
				// count the badge was handed is what says so.
				onRestart={() => {
					if (busyBotCount === 0) {
						void updater.controller.restart()
					}
				}}
			/>
		),
		[updater.state, updater.controller, busyBotCount],
	)

	// The roster is memoised inside the design system so a streamed token does not
	// re-measure its layout projections, which only holds if the array it is handed
	// is the same one between renders. Every input here is stable through a turn —
	// the last settled message of every bot included — and the clock hands down one
	// reading a minute, so every row of the array it builds is aged against the same
	// now and no row's age goes stale under the reader.
	const now = useRosterClock()
	const rosterBots = useMemo(
		() => toRosterBots(bots, { working, previews }, now),
		[bots, working, previews, now],
	)

	// One way to ask, whichever way it is asked: the gear in the conversation's bar
	// and the chord below it are the same toggle. The chord is off while there is no
	// conversation, because the settings it would open belong to the bot being read.
	const toggleSettings = useCallback(
		() => roster.controller.setEditing(!isEditing),
		[roster.controller, isEditing],
	)

	// The name and the picture come from the record, the scheme and the palette from
	// the provider painting the window: what the dialog edits is the two halves read
	// as one. The chip is handed the same value — it draws the identity the dialog's
	// breadcrumb draws, so there is nothing for a second reading to disagree with.
	const userSettings = useMemo(
		() =>
			toUserSettingsValue(user.state.profile, {
				colorScheme: theme.theme,
				palette: theme.palette,
			}),
		[user.state.profile, theme.theme, theme.palette],
	)

	// The language is the one setting the record holds and the value does not: what
	// the interface reads in lives in the translation runtime, so the mirror is
	// where it is read from and this only holds what the settings mark as chosen.
	const [language, setLanguage] = useState(chosenLanguage)

	useSettingsShortcut({
		isEnabled: Boolean(selected),
		onToggle: toggleSettings,
	})

	return (
		<>
			<WorkspaceShell
				defaultOpen
				sidebar={
					<AgentSidebar
						bots={rosterBots}
						footer={updateBadge}
						onCreateBot={() => {
							void roster.controller.create()
						}}
						onDeleteBot={roster.controller.askToDelete}
						onEditBot={roster.controller.edit}
						onOpenUserSettings={() => user.controller.setSettingsOpen(true)}
						onSelectBot={roster.controller.select}
						selectedBotId={selectedBotId ?? undefined}
						user={userSettings}
					/>
				}
			>
				{!hasLoaded ? (
					// The record is still being read: an empty state here would tell a
					// reader who owns bots that they own none. The drag region is what
					// keeps a window with nothing in it movable.
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
					// No bot, so no chat: the roster's create button is the way out of here,
					// and the header is what keeps the window draggable in the meantime.
					<AppHeader insetWindowControls data-tauri-drag-region="deep" />
				)}
			</WorkspaceShell>
			{/* Over the conversation rather than beside it: closing the settings gives
			the width back without touching what is selected or where it is scrolled. */}
			{selected ? (
				<BotSettingsDialog
					confirmingDelete={isConfirmingDelete}
					models={modelOptionsFor(selected.model, catalogue)}
					onAvatarUpload={(file) => {
						void roster.controller.uploadAvatar(selected.id, file)
					}}
					onBrowseWorkingDirectory={browseWorkingDirectory}
					onClose={() => roster.controller.setEditing(false)}
					onConfirmingDeleteChange={(confirming) => {
						if (confirming) {
							roster.controller.askToDelete(selected.id)
						} else {
							roster.controller.cancelDelete()
						}
					}}
					onDelete={() => {
						void deleteBot(selected.id)
					}}
					// The record first, then the runtime: a bot that changed what a
					// process is started as retires the one answering for it, and the
					// next prompt is carried by a process started as it reads now.
					onValueChange={(value) => {
						roster.controller.describe(selected.id, value)
						if (changesRuntime(selected, value)) {
							chat.controller.redescribe(selected.id)
						}
					}}
					open={isEditing}
					seed={selected.id}
					value={toSettingsValue(selected)}
					working={activity?.isWorking ?? false}
					workingKind={activity?.kind}
				/>
			) : null}
			{/* Mounted whether or not a bot is selected, and over the window rather
			than inside it: the reader's own settings belong to the app, so opening
			them leaves the conversation and where it is scrolled alone. */}
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
				// One field at a time, each to whichever half holds it: a scheme or a
				// palette goes to the provider, which paints the window before it
				// writes, and the name goes to the record.
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
				}}
				open={user.state.isSettingsOpen}
				value={userSettings}
			/>
		</>
	)
}
