import type { ReactNode, RefObject } from "react"

import { PromptCommandMenu } from "@workspace/ui/components/prompt-command-menu"
import {
	type MentionBot,
	PromptMentionMenu,
} from "@workspace/ui/components/prompt-mention-menu"
import type { RosterBot } from "@workspace/ui/components/roster"

import type { PromptHandle, ThreadMenuSlot } from "@/components/thread-composer"
import type { AgentCommand } from "@/lib/agent/contract"
import {
	commandOptionsFor,
	commandQueryIn,
	promptForCommand,
} from "@/lib/chat/prompt-commands"
import {
	mentionCountsIn,
	mentionQueryIn,
	promptWithMention,
} from "@/lib/conversations/mentions"

export type ThreadMenuWiring = {
	queryIn: (prompt: string) => string | null
	menu: (slot: ThreadMenuSlot) => ReactNode
}

export const promptWithPickedMention = (
	prompt: string,
	bots: RosterBot[],
	botId: string,
): string => {
	const picked = bots.find((bot) => bot.id === botId)
	return picked ? promptWithMention(prompt, picked.name) : prompt
}

type BotThreadMenuInput = {
	commands: AgentCommand[]
	isOverlayOpen: boolean
}

export const botThreadMenu = ({
	commands,
	isOverlayOpen,
}: BotThreadMenuInput): ThreadMenuWiring => ({
	queryIn: (prompt) =>
		isOverlayOpen ? null : commandQueryIn(prompt, commands),
	menu: ({ query, isOpen, onDismiss, onPick, children }) => (
		<PromptCommandMenu
			commands={commandOptionsFor(commands)}
			onDismiss={onDismiss}
			onSelect={(option) => onPick(promptForCommand(option))}
			open={isOpen}
			query={query}
		>
			{children}
		</PromptCommandMenu>
	),
})

type ConversationThreadMenuInput = {
	bots: MentionBot[]
	leadId?: string
	promptRef: RefObject<PromptHandle | null>
	onSeat?: (botId: string) => Promise<boolean>
}

export const conversationThreadMenu = ({
	bots,
	leadId,
	promptRef,
	onSeat,
}: ConversationThreadMenuInput): ThreadMenuWiring => ({
	queryIn: mentionQueryIn,
	menu: ({ prompt, query, isOpen, onDismiss, onPick, children }) => {
		const select = (botId: string, isOutside: boolean) => {
			if (!isOutside) {
				onPick(promptWithPickedMention(prompt, bots, botId))
				return
			}
			const name = bots.find((bot) => bot.id === botId)?.name
			void onSeat?.(botId).then((isSeated) => {
				if (isSeated && name) {
					promptRef.current?.mention(name)
				}
			})
		}

		return (
			<PromptMentionMenu
				bots={bots}
				counts={mentionCountsIn(prompt, bots)}
				leadId={leadId}
				onDismiss={onDismiss}
				onSelect={select}
				open={isOpen}
				query={query}
			>
				{children}
			</PromptMentionMenu>
		)
	},
})
