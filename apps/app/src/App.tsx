import { useEffect, useMemo } from "react"

import { AgentSidebar } from "@workspace/ui/components/agents/agent-sidebar"
import { AppHeader } from "@workspace/ui/components/app-header"
import { BotSettingsPanel } from "@workspace/ui/components/bot-settings-panel"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

import { ChatScreen } from "@/components/chat-screen"
import {
	modelOptionsFor,
	toRosterBots,
	toSettingsValue,
} from "@/lib/bots/bot-settings"
import { useModelCatalogue } from "@/lib/bots/use-model-catalogue"
import { useRoster } from "@/lib/bots/use-roster"
import { createChatDriver } from "@/lib/chat/create-driver"
import {
	lastAssistantTextFor,
	sidebarActivityFor,
} from "@/lib/chat/screen-model"
import { useChat } from "@/lib/chat/use-chat"
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

	const activity = sidebarActivityFor(chat.state)
	const lastMessage = lastAssistantTextFor(chat.state)

	// The roster is memoised inside the design system so a streamed token does not
	// re-measure its layout projections, which only holds if the array it is handed
	// is the same one between renders. Every input here is stable through a turn —
	// the last settled reply included.
	const rosterBots = useMemo(
		() =>
			toRosterBots(bots, {
				selectedBotId,
				isWorking: activity.isWorking,
				kind: activity.kind,
				lastMessage,
			}),
		[bots, selectedBotId, activity.isWorking, activity.kind, lastMessage],
	)

	return (
		<WorkspaceShell
			defaultOpen
			// Mounted only while it is open: a closed panel is no column at all, so the
			// conversation has the whole width and the gear in its header is the way back.
			panel={
				selected && isEditing ? (
					<BotSettingsPanel
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
						onValueChange={(value) =>
							roster.controller.describe(selected.id, value)
						}
						value={toSettingsValue(selected)}
						working={activity.isWorking}
						workingKind={activity.kind}
					/>
				) : null
			}
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
					onToggleSettings={() => roster.controller.setEditing(!isEditing)}
				/>
			) : (
				// No bot, so no chat: the roster's create button is the way out of here,
				// and the header is what keeps the window draggable in the meantime.
				<AppHeader insetWindowControls data-tauri-drag-region="deep" />
			)}
		</WorkspaceShell>
	)
}
