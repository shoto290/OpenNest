import { type RefObject, useCallback, useMemo, useRef, useState } from "react"

import { AppHeader } from "@workspace/ui/components/app-header"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { BotWorking } from "@workspace/ui/components/bot-working"
import { ChatLayout } from "@workspace/ui/components/chat-layout"
import { ChatNotice } from "@workspace/ui/components/chat-notice"
import {
	AssistantTurn,
	ChatTurnGroup,
	type ChatTurnRun,
	UserTurn,
} from "@workspace/ui/components/chat-turn"
import {
	type ConversationBot,
	ConversationBotsProvider,
} from "@workspace/ui/components/conversation-bots"
import { ConversationEmptyState } from "@workspace/ui/components/conversation-empty-state"
import { HeaderConversationButton } from "@workspace/ui/components/header-conversation-button"
import type { MessageAuthor } from "@workspace/ui/components/message"
import type { QuotedMessage } from "@workspace/ui/components/message-quote"
import type { MessageScrollerHandle } from "@workspace/ui/components/message-scroller"
import {
	PINNED_AVATAR_SIZE,
	type PinnedMessage,
	PinnedMessages,
} from "@workspace/ui/components/pinned-messages"
import { PromptAttachButton } from "@workspace/ui/components/prompt-attach-button"
import { PromptAttachments } from "@workspace/ui/components/prompt-attachments"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { PromptMentionMenu } from "@workspace/ui/components/prompt-mention-menu"
import { UserAvatar } from "@workspace/ui/components/user-avatar"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { TurnBody } from "@/components/turn-body"
import {
	describeAttachmentError,
	type StagedAttachment,
} from "@/lib/chat/attachments"
import type {
	AttachmentStoreError,
	AttachmentsOwner,
} from "@/lib/chat/attachments-contract"
import type { AttachmentsController } from "@/lib/chat/attachments-controller"
import { messageWithAttachments } from "@/lib/chat/message-attachments"
import { pinTimestamp } from "@/lib/chat/pin-timestamp"
import type { PinnedBubble } from "@/lib/chat/pinned-bubbles"
import { holdsDismissal } from "@/lib/chat/prompt-commands"
import {
	bubbleIdOf,
	quotedMessageIdsIn,
	quotedTargetsIn,
	type ReplyTarget,
	type TranscriptRow,
	toRuns,
	toTranscriptRows,
} from "@/lib/chat/screen-model"
import { useAttachments } from "@/lib/chat/use-attachments"
import { usePinnedMessages } from "@/lib/chat/use-pinned-messages"
import type { WorkingState } from "@/lib/chat/working-kind"
import type { RefusedMessage } from "@/lib/conversations/conversation-controller"
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

type ConversationScreenProps = {
	attachments: AttachmentsController
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
		excerpt: messageWithAttachments(bubble.text).text.trim(),
	}
}

const botNameIn = (
	authors: Map<string, MessageAuthor>,
	botId: string | null,
): string | undefined => (botId ? authors.get(botId)?.name : undefined)

type SpeakingBotsProps = {
	speaking?: ConversationBot
	work: WorkingState | null
	waiting: ConversationBot[]
	onStop: () => void
}

const SpeakingBots = ({
	speaking,
	work,
	waiting,
	onStop,
}: SpeakingBotsProps) => (
	<>
		{speaking ? (
			<BotWorking
				animal={speaking.animal}
				blot={speaking.blot}
				image={speaking.image}
				kind={work?.kind}
				label={work?.label}
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

type ConversationNoticeProps = {
	refusal: AttachmentStoreError | null
	looping: (ConversationBot | undefined)[]
	onDismissRefusal: () => void
	onStop: () => void
}

const ConversationNotice = ({
	refusal,
	looping,
	onDismissRefusal,
	onStop,
}: ConversationNoticeProps) => {
	const t = useChatCopy()

	if (refusal) {
		return (
			<ChatNotice
				description={describeAttachmentError(t, refusal)}
				onDismiss={onDismissRefusal}
				title={t("screen.attachmentsRefused")}
				tone="warning"
			/>
		)
	}

	const [first, second] = looping
	return first && second ? (
		<HandoverNotice onStop={onStop} pair={[first, second]} />
	) : null
}

type ConversationTurnProps = {
	row: TranscriptRow
	author?: MessageAuthor
	repliedTo?: QuotedMessage
	pinned: boolean
	run?: ChatTurnRun
	carriesMark?: boolean
	onPin: (messageId: string, blockIndex: number) => void
	onReply: (target: ReplyTarget) => void
}

const ConversationTurn = ({
	row,
	author,
	repliedTo,
	pinned,
	run,
	carriesMark,
	onPin,
	onReply,
}: ConversationTurnProps) => {
	const { text, attachments } = messageWithAttachments(row.text)
	const content = <TurnBody attachments={attachments} text={text} />
	const anchor = bubbleIdOf(row.messageId, row.blockIndex)
	const pin = () => {
		onPin(row.messageId, row.blockIndex)
	}
	const reply = () => {
		onReply({
			messageId: row.messageId,
			role: row.role,
			excerpt: text.trim(),
			authorBotId: row.authorBotId,
		})
	}

	return row.role === "user" ? (
		<UserTurn
			copyText={row.text}
			messageId={anchor}
			onPin={pin}
			onReply={reply}
			pinned={pinned}
			repliedTo={repliedTo}
			run={run}
			state={row.completion}
		>
			{content}
		</UserTurn>
	) : (
		<AssistantTurn
			author={author}
			carriesMark={carriesMark}
			copyText={row.text}
			messageId={anchor}
			onPin={pin}
			onReply={reply}
			pinned={pinned}
			repliedTo={repliedTo}
			run={run}
			state={row.completion}
		>
			{content}
		</AssistantTurn>
	)
}

type RefusedTurnProps = {
	message: RefusedMessage
	repliedTo?: QuotedMessage
	onSendAgain: (messageId: string) => void
}

const RefusedTurn = ({ message, repliedTo, onSendAgain }: RefusedTurnProps) => (
	<ChatTurnGroup>
		<UserTurn
			copyText={message.text}
			onRetry={() => onSendAgain(message.id)}
			repliedTo={repliedTo}
			state="failed"
		>
			<TurnBody {...messageWithAttachments(message.text)} />
		</UserTurn>
	</ChatTurnGroup>
)

type ConversationComposerProps = {
	bots: ConversationBot[]
	leadId?: string
	textareaRef: RefObject<HTMLTextAreaElement | null>
	canAttach: boolean
	attachments: StagedAttachment[]
	isDropTarget: boolean
	onAttach: (files: File[]) => void
	onRemoveAttachment: (id: string) => void
	onSubmit: (text: string) => Promise<boolean>
}

const ConversationComposer = ({
	bots,
	leadId,
	textareaRef,
	canAttach,
	attachments,
	isDropTarget,
	onAttach,
	onRemoveAttachment,
	onSubmit,
}: ConversationComposerProps) => {
	const t = useChatCopy()
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
			textareaRef.current?.focus({ preventScroll: true })
		},
		[bots, textareaRef],
	)

	const submit = useCallback(
		async (value: string) => {
			if (await onSubmit(value)) {
				setPrompt("")
			}
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
				attachments={
					<PromptAttachments
						items={attachments}
						onRemove={onRemoveAttachment}
					/>
				}
				dropTarget={isDropTarget}
				leading={
					<PromptAttachButton disabled={!canAttach} onAttach={onAttach} />
				}
				onAttach={canAttach ? onAttach : undefined}
				onSubmit={submit}
				onValueChange={setPrompt}
				placeholder={t("composer.placeholder")}
				textareaRef={textareaRef}
				value={prompt}
			/>
		</PromptMentionMenu>
	)
}

export function ConversationScreen({
	attachments,
	conversation,
	runtimes,
	readerName,
	isSettingsOpen,
	onOpenSettings,
}: ConversationScreenProps) {
	const t = useChatCopy()
	const { state, controller } = useConversation(runtimes, conversation)
	const scrollerRef = useRef<MessageScrollerHandle>(null)
	const composerRef = useRef<HTMLTextAreaElement>(null)
	const conversationRef = useRef<HTMLDivElement>(null)
	const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null)
	const bots = useMemo(
		() => toConversationBots(conversation.participants),
		[conversation],
	)
	const authors = useMemo(() => authorsOf(conversation), [conversation])
	const present = useMemo(
		() => toConversationBots(presentParticipants(conversation)),
		[conversation],
	)
	const owner = useMemo<AttachmentsOwner>(
		() => ({ kind: "conversation", id: conversation.id }),
		[conversation.id],
	)
	const canAttach = present.length > 0
	const staged = useAttachments(attachments, owner, canAttach, conversationRef)
	const runs = toRuns(toTranscriptRows(state.messages))
	const isAnyBotWorking =
		state.speakingBotId !== null || state.waitingBotIds.length > 0
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

	const jumpToMessage = useCallback(
		(messageId: string) => {
			void reachMessage(messageId)
		},
		[reachMessage],
	)

	const jumpToPin = useCallback(
		(bubbleId: string) => {
			jumpToMessage(pins.anchorOf(bubbleId))
		},
		[jumpToMessage, pins.anchorOf],
	)

	const refused = state.refusedMessage
	const quotes = useMemo(() => {
		const answered = quotedMessageIdsIn(state.messages)
		return quotedTargetsIn(
			state.messages,
			refused?.repliedToMessageId
				? [...answered, refused.repliedToMessageId]
				: answered,
		)
	}, [state.messages, refused])

	const quoteFor = useCallback(
		(target: ReplyTarget): QuotedMessage => ({
			author:
				target.role === "user"
					? reader
					: (botNameIn(authors, target.authorBotId) ?? t("working.name")),
			excerpt: target.excerpt,
			from: target.role,
			onJump: () => jumpToMessage(target.messageId),
		}),
		[authors, reader, t, jumpToMessage],
	)

	const quoteOf = useCallback(
		(quotedMessageId: string | null) => {
			const target = quotedMessageId ? quotes.get(quotedMessageId) : undefined
			return target ? quoteFor(target) : undefined
		},
		[quotes, quoteFor],
	)

	const focusComposer = useCallback(() => {
		composerRef.current?.focus({ preventScroll: true })
	}, [])

	const holdReply = useCallback(
		(target: ReplyTarget) => {
			setReplyTarget(target)
			focusComposer()
		},
		[focusComposer],
	)

	const releaseReply = useCallback(() => {
		setReplyTarget(null)
		focusComposer()
	}, [focusComposer])

	const send = useCallback(
		async (text: string) => {
			scrollerRef.current?.scrollToEnd("auto")
			const sent = await staged.submit(text, replyTarget?.messageId)
			if (sent) {
				setReplyTarget(null)
			}
			return sent
		},
		[staged.submit, replyTarget],
	)

	const stop = useCallback(() => {
		void controller.stop()
	}, [controller])

	return (
		<ConversationBotsProvider bots={bots}>
			<ChatLayout
				composer={
					<ConversationComposer
						attachments={staged.items}
						bots={present}
						canAttach={canAttach}
						isDropTarget={staged.isDropTarget}
						leadId={leadOf(conversation)}
						onAttach={staged.stage}
						onRemoveAttachment={staged.remove}
						onSubmit={send}
						textareaRef={composerRef}
					/>
				}
				header={
					<AppHeader
						data-tauri-drag-region="deep"
						leading={
							<HeaderConversationButton
								bots={present}
								isSettingsOpen={isSettingsOpen}
								name={conversation.title}
								onOpenSettings={() => onOpenSettings(conversation.id)}
							/>
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
					<ConversationNotice
						looping={looping}
						onDismissRefusal={staged.dismissRefusal}
						onStop={stop}
						refusal={staged.refusal}
					/>
				}
				older={
					state.messages.length > 0
						? { has: state.hasOlder, onLoad: controller.loadOlder }
						: undefined
				}
				onFollowChange={controller.follow}
				reply={
					replyTarget
						? {
								...quoteFor(replyTarget),
								onDismiss: releaseReply,
							}
						: undefined
				}
				rootRef={conversationRef}
				scrollerRef={scrollerRef}
				transcriptKey={conversation.id}
			>
				{state.messages.length === 0 && !refused ? (
					<ConversationEmptyState bots={present} title={conversation.title} />
				) : null}

				{runs.map((run, runIndex) => (
					<ChatTurnGroup
						carriesMark={runIndex === runs.length - 1 && !isAnyBotWorking}
						key={bubbleIdOf(run[0].messageId, run[0].blockIndex)}
					>
						{run.map((row) => (
							<ConversationTurn
								author={
									row.authorBotId ? authors.get(row.authorBotId) : undefined
								}
								key={bubbleIdOf(row.messageId, row.blockIndex)}
								onPin={pins.toggle}
								onReply={holdReply}
								pinned={pins.isPinned(
									bubbleIdOf(row.messageId, row.blockIndex),
								)}
								repliedTo={quoteOf(row.quotedMessageId)}
								row={row}
							/>
						))}
					</ChatTurnGroup>
				))}

				{refused ? (
					<RefusedTurn
						message={refused}
						onSendAgain={controller.sendAgain}
						repliedTo={quoteOf(refused.repliedToMessageId)}
					/>
				) : null}

				<SpeakingBots
					onStop={stop}
					speaking={
						state.speakingBotId ? botOf(state.speakingBotId) : undefined
					}
					waiting={state.waitingBotIds.flatMap((botId) => botOf(botId) ?? [])}
					work={state.speakingWork}
				/>
			</ChatLayout>
		</ConversationBotsProvider>
	)
}
