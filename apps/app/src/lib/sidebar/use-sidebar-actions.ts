import { useMemo } from "react"

import type { AppSidebarProps } from "@workspace/ui/components/app-sidebar"

import { moveBotToSpace } from "../bots/bot-space-move"
import type { RosterController } from "../bots/roster-controller"
import type { AttachmentsController } from "../chat/attachments-controller"
import type { ChatController } from "../chat/chat-controller"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { CollapsedSectionsController } from "../sections/collapsed-sections-controller"
import { newSectionFor } from "../sections/section-space"
import {
	type SectionsController,
	spaceOfSection,
} from "../sections/sections-controller"
import type { SpacePluginController } from "../spaces/space-plugin-controller"
import type { SpacesController } from "../spaces/spaces-controller"
import type { UserController } from "../user/preferences-controller"
import type { UserPluginController } from "../user/user-plugin-controller"

export type SidebarActions = Required<
	Pick<
		AppSidebarProps,
		| "onCollapseSection"
		| "onCreateBot"
		| "onCreateSection"
		| "onCreateSpace"
		| "onDeleteBot"
		| "onDeleteConversation"
		| "onDeleteSection"
		| "onDuplicateBot"
		| "onDuplicateBotToSpace"
		| "onEditBot"
		| "onMoveBotToSpace"
		| "onOpenConversationSettings"
		| "onOpenSpaceSettings"
		| "onOpenUserSettings"
		| "onPinRoster"
		| "onRenameSection"
		| "onReorderSpaces"
		| "onSelectBot"
		| "onSelectConversation"
		| "onSelectSpace"
	>
>

export type SidebarActionsSource = {
	attachments: AttachmentsController
	chat: ChatController
	collapsedSections: CollapsedSectionsController
	roster: RosterController
	runtimes: ConversationRuntimes
	sections: SectionsController
	spacePlugin: SpacePluginController
	spaces: SpacesController
	user: UserController
	userPlugin: UserPluginController
}

export const useSidebarActions = ({
	attachments,
	chat,
	collapsedSections,
	roster,
	runtimes,
	sections,
	spacePlugin,
	spaces,
	user,
	userPlugin,
}: SidebarActionsSource): SidebarActions =>
	useMemo(
		() => ({
			onCollapseSection: (id, isCollapsed) => {
				const spaceId = spaceOfSection(sections.getState(), id)
				if (spaceId) {
					collapsedSections.collapse(spaceId, id, isCollapsed)
				}
			},
			onCreateBot: () => {
				void roster.create()
			},
			onCreateSection: (name, rowId) => {
				const { rosters, conversationRosters } = roster.getState()
				const born = newSectionFor({
					rosters,
					conversationRosters,
					shownSpaceId: spaces.getState().selectedSpaceId,
					rowId,
				})
				if (!born) {
					return
				}
				void sections.create(born.spaceId, name, born.botId).then((created) => {
					if (created && born.conversationId) {
						void roster.moveConversationToSection(
							born.conversationId,
							created.id,
						)
					}
				})
			},
			onCreateSpace: () => {
				void spaces.create()
			},
			onDeleteBot: roster.askToDelete,
			onDeleteConversation: async (id) => {
				await runtimes.release(id)
				attachments.forget({ kind: "conversation", id })
				await roster.removeConversation(id)
			},
			onDeleteSection: (id) => {
				void sections.remove(id)
			},
			onDuplicateBot: (id) => {
				void roster.duplicate(id)
			},
			onDuplicateBotToSpace: (id, spaceId) => {
				void roster.duplicate(id, spaceId).then((copy) => {
					if (copy) {
						spaces.select(spaceId)
					}
				})
			},
			onEditBot: roster.edit,
			onMoveBotToSpace: (botId, spaceId) => {
				void moveBotToSpace({ botId, spaceId, roster, chat, spaces })
			},
			onOpenConversationSettings: roster.editConversation,
			onOpenSpaceSettings: () => {
				spaces.setSettingsOpen(true)
				const spaceId = spaces.getState().selectedSpaceId
				if (spaceId) {
					void spacePlugin.open(spaceId)
				}
			},
			onOpenUserSettings: () => {
				user.setSettingsOpen(true)
				void userPlugin.open()
			},
			onPinRoster: (spaceId, pins) => {
				void sections.pin(spaceId, pins)
			},
			onRenameSection: sections.rename,
			onReorderSpaces: (ids) => {
				void spaces.reorder(ids)
			},
			onSelectBot: roster.select,
			onSelectConversation: roster.selectConversation,
			onSelectSpace: spaces.select,
		}),
		[
			attachments,
			chat,
			collapsedSections,
			roster,
			runtimes,
			sections,
			spacePlugin,
			spaces,
			user,
			userPlugin,
		],
	)
