import { useCallback, useMemo, useRef, useState } from "react"

import { AppHeader } from "@workspace/ui/components/app-header"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { BotWorking } from "@workspace/ui/components/bot-working"
import { Button } from "@workspace/ui/components/button"
import { ChatLayout } from "@workspace/ui/components/chat-layout"
import { ChatNotice } from "@workspace/ui/components/chat-notice"
import {
	AssistantTurn,
	ChatTurnGroup,
	UserTurn,
} from "@workspace/ui/components/chat-turn"
import {
	type ConversationBot,
	ConversationBotsProvider,
} from "@workspace/ui/components/conversation-bots"
import { ConversationEmptyState } from "@workspace/ui/components/conversation-empty-state"
import { Markdown } from "@workspace/ui/components/markdown"
import type { MessageAuthor } from "@workspace/ui/components/message"
import type { MessageScrollerHandle } from "@workspace/ui/components/message-scroller"
import {
	PINNED_AVATAR_SIZE,
	type PinnedMessage,
	PinnedMessages,
} from "@workspace/ui/components/pinned-messages"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { PromptMentionMenu } from "@workspace/ui/components/prompt-mention-menu"
import { UserAvatar } from "@workspace/ui/components/user-avatar"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { pinTimestamp } from "@/lib/chat/pin-timestamp"
import type { PinnedBubble } from "@/lib/chat/pinned-bubbles"
import { holdsDismissal } from "@/lib/chat/prompt-commands"
import {
	bubbleIdOf,
	type TranscriptRow,
	toRuns,
	toTranscriptRows,
} from "@/lib/chat/screen-model"
import { usePinnedMessages } from "@/lib/chat/use-pinned-messages"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import { mentionQueryIn, promptWithMention } from "@/lib/conversations/mentions"
import {
	authorsOf,
	leadOf,
	presentParticipants,
	toConversationBots,
} from "@/lib/conversations/roster-conversations"
import type { Conversation } from "@/lib/conversations/store-contract"
import { useConversation } from "@/lib/conversations/use-conversation"
import { hasOverlayWindowControls } from "@/lib/host"

type ConversationScreenProps = {
	conversation: Conversation
	runtimes: ConversationRuntimes
	readerName: string
	isSettingsOpen: boolean
	onOpenSettings: (conversationId: string) => void
}

const nextFrame = () =>
	new Promise<void>((resolve) => {
		requestAnimationFrame(() => resolve())
	})

const toPinnedRow = (
	{ id, bubble }: PinnedBubble,
	author: MessageAuthor | undefined,
	reader: string,
): PinnedMessage => {
	const isBotAuthor = bubble.role === "assistant" && author !== undefined

	return {
		id,
		author: isBotAuthor ? author.name : reader,
		avatar: isBotAuthor ? (
			<BotIdentityAvatar
				animal={author.animal}
				blot={author.blot}
				image={author.image}
				name={author.name}
				seed={author.id}
				size={PINNED_AVATAR_SIZE}
			/>
		) : (
			<UserAvatar name={reader} size={PINNED_AVATAR_SIZE} />
		),
		timestamp: pinTimestamp(bubble.timestamp),
		excerpt: bubble.text.trim(),
	}
}

type SpeakingBotsProps = {
	speaking?: ConversationBot
	waiting: ConversationBot[]
	onStop: () => void
}

const SpeakingBots = ({ speaking, waiting, onStop }: SpeakingBotsProps) => (
	<>
		{speaking ? (
			<BotWorking
				animal={speaking.animal}
				blot={speaking.blot}
				image={speaking.image}
				name={speaking.name}
				onStop={onStop}
				seed={speaking.id}
			/>
		) : null}
		{waiting.map((bot) => (
			<BotWorking
				animal={bot.animal}
				blot={bot.blot}
				image={bot.image}
				key={bot.id}
				kind="waiting"
				name={bot.name}
				seed={bot.id}
			/>
		))}
	</>
)

type HandoverNoticeProps = {
	pair: [ConversationBot, ConversationBot]
	onStop: () => void
}

const HandoverNotice = ({ pair, onStop }: HandoverNoticeProps) => {
	const t = useChatCopy()
	const named = { first: pair[0].name, second: pair[1].name }

	return (
		<ChatNotice
			action={{ label: t("screen.handover.stop"), onClick: onStop }}
			description={t("screen.handover.description")}
			title={t("screen.handover.title", named)}
			tone="warning"
		/>
	)
}

type ConversationTurnProps = {
	row: TranscriptRow
	author?: MessageAuthor
	pinned: boolean
	onPin: (messageId: string, blockIndex: number) => void
}

const ConversationTurn = ({
	row,
	author,
	pinned,
	onPin,
}: ConversationTurnProps) => {
	const content = <Markdown>{row.text}</Markdown>
	const anchor = bubbleIdOf(row.messageId, row.blockIndex)
	const pin = () => {
		onPin(row.messageId, row.blockIndex)
	}

	return row.role === "user" ? (
		<UserTurn
			copyText={row.text}
			messageId={anchor}
			onPin={pin}
			pinned={pinned}
			state={row.completion}
		>
			{content}
		</UserTurn>
	) : (
		<AssistantTurn
			author={author}
			copyText={row.text}
			messageId={anchor}
			onPin={pin}
			pinned={pinned}
			state={row.completion}
		>
			{content}
		</AssistantTurn>
	)
}

type ConversationComposerProps = {
	bots: ConversationBot[]
	leadId?: string
	onSubmit: (text: string) => void
}

const ConversationComposer = ({
	bots,
	leadId,
	onSubmit,
}: ConversationComposerProps) => {
	const t = useChatCopy()
	const composerRef = useRef<HTMLTextAreaElement>(null)
	const [prompt, setPrompt] = useState("")
	const [wasDismissed, setWasDismissed] = useState(false)

	const query = mentionQueryIn(prompt)
	const isDismissed = holdsDismissal(wasDismissed, query)
	if (wasDismissed !== isDismissed) {
		setWasDismissed(isDismissed)
	}

	const select = useCallback(
		(botId: string) => {
			const taken = bots.find((bot) => bot.id === botId)
			if (taken) {
				setPrompt((held) => promptWithMention(held, taken.name))
			}
			composerRef.current?.focus({ preventScroll: true })
		},
		[bots],
	)

	const submit = useCallback(
		(value: string) => {
			onSubmit(value)
			setPrompt("")
		},
		[onSubmit],
	)

	return (
		<PromptMentionMenu
			bots={bots}
			leadId={leadId}
			onDismiss={() => setWasDismissed(true)}
			onSelect={select}
			open={query !== null && !isDismissed}
			query={query ?? ""}
		>
			<PromptInput
				onSubmit={submit}
				onValueChange={setPrompt}
				placeholder={t("composer.placeholder")}
				textareaRef={composerRef}
				value={prompt}
			/>
		</PromptMentionMenu>
	)
}

export function ConversationScreen({
	conversation,
	runtimes,
	readerName,
	isSettingsOpen,
	onOpenSettings,
}: ConversationScreenProps) {
	const t = useChatCopy()
	const { state, controller } = useConversation(runtimes, conversation)
	const scrollerRef = useRef<MessageScrollerHandle>(null)
	const bots = useMemo(
		() => toConversationBots(conversation.participants),
		[conversation],
	)
	const authors = useMemo(() => authorsOf(conversation), [conversation])
	const present = useMemo(
		() => toConversationBots(presentParticipants(conversation)),
		[conversation],
	)
	const runs = toRuns(toTranscriptRows(state.messages))
	const botOf = useCallback(
		(botId: string) => bots.find((bot) => bot.id === botId),
		[bots],
	)
	const looping = state.loopingPair?.map(botOf) ?? []
	const reader = readerName || t("working.name")
	const pins = usePinnedMessages(controller, state.conversationId)
	const pinnedRows = useMemo(
		() =>
			pins.bubbles.map((shown) =>
				toPinnedRow(
					shown,
					shown.bubble.authorBotId
						? authors.get(shown.bubble.authorBotId)
						: undefined,
					reader,
				),
			),
		[pins.bubbles, authors, reader],
	)

	const reachMessage = useCallback(
		async (messageId: string) => {
			while (scrollerRef.current?.scrollToMessage(messageId) === false) {
				const shown = controller.getState()
				if (!shown.hasOlder) {
					return
				}
				await controller.loadOlder()
				await nextFrame()
				if (controller.getState().messages.length === shown.messages.length) {
					return
				}
			}
		},
		[controller],
	)

	const jumpToPin = useCallback(
		(bubbleId: string) => {
			void reachMessage(pins.anchorOf(bubbleId))
		},
		[reachMessage, pins.anchorOf],
	)

	const send = useCallback(
		(text: string) => {
			void controller.send(text)
		},
		[controller],
	)

	const stop = useCallback(() => {
		void controller.stop()
	}, [controller])

	return (
		<ConversationBotsProvider bots={bots}>
			<ChatLayout
				composer={
					<ConversationComposer
						bots={present}
						leadId={leadOf(conversation)}
						onSubmit={send}
					/>
				}
				header={
					<AppHeader
						data-tauri-drag-region="deep"
						insetWindowControls={hasOverlayWindowControls()}
						leading={
							<Button
								aria-expanded={isSettingsOpen}
								onClick={() => onOpenSettings(conversation.id)}
								size="lg"
								variant="ghost"
							>
								{present.map((bot) => (
									<BotIdentityAvatar
										animal={bot.animal}
										blot={bot.blot}
										image={bot.image}
										key={bot.id}
										name={bot.name}
										seed={bot.id}
										size={PINNED_AVATAR_SIZE}
									/>
								))}
								{conversation.title}
							</Button>
						}
						trailing={
							<PinnedMessages
								messages={pinnedRows}
								onJump={jumpToPin}
								onUnpin={pins.unpin}
							/>
						}
					/>
				}
				label={t("screen.label")}
				notice={
					looping[0] && looping[1] ? (
						<HandoverNotice onStop={stop} pair={[looping[0], looping[1]]} />
					) : undefined
				}
				older={
					state.messages.length > 0
						? { has: state.hasOlder, onLoad: controller.loadOlder }
						: undefined
				}
				scrollerRef={scrollerRef}
				transcriptKey={conversation.id}
			>
				{state.messages.length === 0 ? (
					<ConversationEmptyState bots={present} title={conversation.title} />
				) : null}

				{runs.map((run) => (
					<ChatTurnGroup key={bubbleIdOf(run[0].messageId, run[0].blockIndex)}>
						{run.map((row) => (
							<ConversationTurn
								author={
									row.authorBotId ? authors.get(row.authorBotId) : undefined
								}
								key={bubbleIdOf(row.messageId, row.blockIndex)}
								onPin={pins.toggle}
								pinned={pins.isPinned(
									bubbleIdOf(row.messageId, row.blockIndex),
								)}
								row={row}
							/>
						))}
					</ChatTurnGroup>
				))}

				<SpeakingBots
					onStop={stop}
					speaking={
						state.speakingBotId ? botOf(state.speakingBotId) : undefined
					}
					waiting={state.waitingBotIds.flatMap((botId) => botOf(botId) ?? [])}
				/>
			</ChatLayout>
		</ConversationBotsProvider>
	)
}
