import { useCallback, useEffect, useMemo } from "react"

import { AgentSidebar } from "@workspace/ui/components/agents/agent-sidebar"
import { AppHeader } from "@workspace/ui/components/app-header"
import { BotSettingsDialog } from "@workspace/ui/components/bot-settings-dialog"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

import { ChatScreen } from "@/components/chat-screen"
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
import { createChatDriver } from "@/lib/chat/create-driver"
import { useBotActivity, useBotPreviews, useChat } from "@/lib/chat/use-chat"
import { createTranscriptStore } from "@/lib/conversations/create-store"

/** The folder picker the working directory field opens. There is none on this
 * build: choosing a directory needs a host dialog this app does not carry yet, and
 * what a bot's runs happen in is the next ticket's. The field still shows what the
 * store holds. */
const browseWorkingDirectory = () => undefined

export function App() {
	const driver = useMemo(createChatDriver, [])
	const store = useMemo(createTranscriptStore, [])
	const chat = useChat(driver, store)
	const roster = useRoster(store)
	const catalogue = useModelCatalogue()

	const { bots, selectedBotId, isEditing, isConfirmingDelete } = roster.state
	const selected = bots.find((bot) => bot.id === selectedBotId)

	useEffect(() => {
		void roster.controller.load()
	}, [roster.controller])

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
						onCreateBot={() => {
							void roster.controller.create()
						}}
						onDeleteBot={roster.controller.askToDelete}
						onEditBot={roster.controller.edit}
						onSelectBot={roster.controller.select}
						selectedBotId={selectedBotId ?? undefined}
					/>
				}
			>
				{selected ? (
					<ChatScreen
						bot={selected}
						chat={chat}
						isSettingsOpen={isEditing}
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
		</>
	)
}
