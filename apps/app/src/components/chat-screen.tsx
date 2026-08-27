import {
	memo,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"

import { AppHeader } from "@workspace/ui/components/app-header"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { BotWorking } from "@workspace/ui/components/bot-working"
import { ChatEmptyState } from "@workspace/ui/components/chat-empty-state"
import { ChatLayout } from "@workspace/ui/components/chat-layout"
import { ChatNotice } from "@workspace/ui/components/chat-notice"
import {
	AssistantTurn,
	CHAT_AVATAR_SIZE,
	ChatTurnGroup,
	type ChatTurnRun,
	UserTurn,
} from "@workspace/ui/components/chat-turn"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import type { QuotedMessage } from "@workspace/ui/components/message-quote"
import type { MessageScrollerHandle } from "@workspace/ui/components/message-scroller"
import {
	PINNED_AVATAR_SIZE,
	type PinnedMessage,
	PinnedMessages,
} from "@workspace/ui/components/pinned-messages"
import { PromptAttachButton } from "@workspace/ui/components/prompt-attach-button"
import { PromptAttachments } from "@workspace/ui/components/prompt-attachments"
import { PromptCommandMenu } from "@workspace/ui/components/prompt-command-menu"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import {
	ToolApproval,
	ToolApprovalCode,
} from "@workspace/ui/components/tool-approval"
import {
	ToolQuestion,
	type ToolQuestionItem,
} from "@workspace/ui/components/tool-question"
import { UserAvatar } from "@workspace/ui/components/user-avatar"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { TurnBody } from "@/components/turn-body"
import type {
	AgentCommand,
	AskedQuestion,
	PermissionRequest,
	QuestionRequest,
} from "@/lib/agent/contract"
import { describeTransportError } from "@/lib/agent/messages"
import {
	describeAttachmentError,
	type StagedAttachment,
} from "@/lib/chat/attachments"
import type {
	AttachmentStoreError,
	AttachmentsOwner,
} from "@/lib/chat/attachments-contract"
import type { AttachmentsController } from "@/lib/chat/attachments-controller"
import type { ChatController } from "@/lib/chat/chat-controller"
import type { ChatError, OutboxEntry } from "@/lib/chat/chat-state"
import { canStopTurn, isSessionReady, isTurnBusy } from "@/lib/chat/chat-state"
import { isTableBlock } from "@/lib/chat/markdown-blocks"
import { messageWithAttachments } from "@/lib/chat/message-attachments"
import { pinTimestamp } from "@/lib/chat/pin-timestamp"
import type { PinnedBubble } from "@/lib/chat/pinned-bubbles"
import {
	commandOptionsFor,
	commandQueryIn,
	holdsDismissal,
	promptForCommand,
} from "@/lib/chat/prompt-commands"
import {
	bubbleIdOf,
	claimsComposerFocus,
	emptyStateStatusFor,
	needsFreshSession,
	noticeTitleFor,
	type ReplyTarget,
	type TranscriptRow,
	toRuns,
	toTranscriptRows,
	workingStateFor,
} from "@/lib/chat/screen-model"
import { useAttachments } from "@/lib/chat/use-attachments"
import type { Chat } from "@/lib/chat/use-chat"
import { usePinnedMessages } from "@/lib/chat/use-pinned-messages"
import { useQuotedMessages } from "@/lib/chat/use-quoted-messages"
import type {
	AvatarAnimal,
	AvatarBlot,
	Bot,
} from "@/lib/conversations/store-contract"
import { avatarSrc } from "@/lib/host"

type BotFace = {
	name: string
	animal: AvatarAnimal
	blot?: AvatarBlot
	seed: string
	image?: string
}

type QuoteAuthors = {
	bot: string
	reader: string
}

const toQuote = (
	target: ReplyTarget,
	authors: QuoteAuthors,
	onJump: (messageId: string) => void,
): QuotedMessage => ({
	author: target.role === "assistant" ? authors.bot : authors.reader,
	excerpt: target.excerpt,
	from: target.role,
	onJump: () => onJump(target.messageId),
})

const toPinnedRow = (
	{ id, bubble }: PinnedBubble,
	bot: BotFace,
	reader: string,
): PinnedMessage => ({
	id,
	author: bubble.role === "assistant" ? bot.name : reader,
	avatar:
		bubble.role === "assistant" ? (
			<BotIdentityAvatar
				animal={bot.animal}
				blot={bot.blot}
				image={bot.image}
				name={bot.name}
				seed={bot.seed}
				size={PINNED_AVATAR_SIZE}
			/>
		) : (
			<UserAvatar name={reader} size={PINNED_AVATAR_SIZE} />
		),
	timestamp: pinTimestamp(bubble.timestamp),
	excerpt: messageWithAttachments(bubble.text).text.trim(),
})

const TranscriptTurn = memo(function TranscriptTurn({
	row,
	controller,
	run,
	avatar,
	name,
	animal,
	blot,
	seed,
	image,
	rejected,
	reader,
	anchor,
	quoted,
	pinned,
	onReply,
	onJump,
	onPin,
}: BotFace & {
	row: TranscriptRow
	controller: ChatController
	run?: ChatTurnRun
	avatar: boolean
	rejected?: boolean
	reader: string
	anchor: string
	quoted?: ReplyTarget
	pinned: boolean
	onReply: (target: ReplyTarget) => void
	onJump: (messageId: string) => void
	onPin: (messageId: string, blockIndex: number) => void
}) {
	const { text, attachments } = messageWithAttachments(row.text)
	const content = <TurnBody attachments={attachments} text={text} />
	const reply = () => {
		onReply({
			messageId: row.messageId,
			role: row.role,
			excerpt: text,
			authorBotId: row.authorBotId,
		})
	}
	const pin = () => {
		onPin(row.messageId, row.blockIndex)
	}

	if (row.role === "user") {
		return (
			<UserTurn
				state={rejected ? "failed" : row.completion}
				run={run}
				copyText={text}
				messageId={anchor}
				repliedTo={
					quoted ? toQuote(quoted, { bot: name, reader }, onJump) : undefined
				}
				pinned={pinned}
				onPin={pin}
				onReply={reply}
				onRetry={() => {
					void controller.retry(row.messageId)
				}}
			>
				{content}
			</UserTurn>
		)
	}

	return (
		<AssistantTurn
			botId={seed}
			state={row.completion}
			run={run}
			copyText={text}
			messageId={anchor}
			pinned={pinned}
			onPin={pin}
			onReply={reply}
			bare={isTableBlock(text)}
			avatar={
				avatar ? (
					<BotIdentityAvatar
						animal={animal}
						blot={blot}
						image={image}
						name={name}
						seed={seed}
						size={CHAT_AVATAR_SIZE}
					/>
				) : null
			}
		>
			{content}
		</AssistantTurn>
	)
})

const QueuedTurn = memo(function QueuedTurn({
	entry,
	controller,
	run,
}: {
	entry: OutboxEntry
	controller: ChatController
	run?: ChatTurnRun
}) {
	const { text, attachments } = messageWithAttachments(entry.text)

	return (
		<UserTurn
			state="queued"
			run={run}
			copyText={text}
			onCancel={() => {
				controller.discard(entry.id)
			}}
		>
			<TurnBody attachments={attachments} text={text} />
		</UserTurn>
	)
})

function PermissionPrompt({
	controller,
	request,
}: {
	controller: ChatController
	request: PermissionRequest
}) {
	const t = useChatCopy()
	const isShell = request.toolName === "Bash"

	return (
		<ToolApproval
			tool={request.toolName}
			title={request.title}
			description={t("screen.permission.description")}
			parameters={
				request.detail && !isShell
					? [
							{
								id: "path",
								label: t("screen.permission.path"),
								value: request.detail,
							},
						]
					: []
			}
			onAllowOnce={() => {
				void controller.respond(request.id, "allowOnce")
			}}
			onDeny={() => {
				void controller.respond(request.id, "deny")
			}}
		>
			{request.detail && isShell ? (
				<ToolApprovalCode code={request.detail} />
			) : null}
		</ToolApproval>
	)
}

const toQuestionItem = (asked: AskedQuestion): ToolQuestionItem => ({
	question: asked.question,
	header: asked.header,
	multiSelect: asked.multiSelect,
	options: asked.options.map((option) => ({
		label: option.label,
		description: option.description ?? "",
		preview: option.preview ?? undefined,
	})),
})

function QuestionPrompt({
	controller,
	request,
}: {
	controller: ChatController
	request: QuestionRequest
}) {
	return (
		<ToolQuestion
			questions={request.questions.map(toQuestionItem)}
			onAnswer={(answers) => {
				void controller.answer(request.id, answers)
			}}
			onDeny={() => {
				void controller.respond(request.id, "deny")
			}}
		/>
	)
}

const Composer = memo(function Composer({
	composerRef,
	readDraft,
	onPromptChange,
	botName,
	commands,
	canAttach,
	isOverlayOpen,
	attachments,
	isDropTarget,
	onAttach,
	onRemoveAttachment,
	onSubmitPrompt,
}: {
	composerRef: RefObject<HTMLTextAreaElement | null>
	readDraft: () => string
	onPromptChange: (draft: string) => void
	botName: string
	commands: AgentCommand[]
	canAttach: boolean
	isOverlayOpen: boolean
	attachments: StagedAttachment[]
	isDropTarget: boolean
	onAttach: (files: File[]) => void
	onRemoveAttachment: (id: string) => void
	onSubmitPrompt: (text: string) => Promise<boolean>
}) {
	const t = useChatCopy()
	const [wasDismissed, setWasDismissed] = useState(false)
	const [prompt, setPrompt] = useState(readDraft)
	const latestPrompt = useRef(prompt)
	const options = useMemo(() => commandOptionsFor(commands), [commands])
	const query = isOverlayOpen ? null : commandQueryIn(prompt, commands)

	const isDismissed = holdsDismissal(wasDismissed, query)
	if (wasDismissed !== isDismissed) {
		setWasDismissed(isDismissed)
	}

	const changePrompt = useCallback(
		(next: string) => {
			latestPrompt.current = next
			setPrompt(next)
			onPromptChange(next)
		},
		[onPromptChange],
	)

	const submit = useCallback(
		async (value: string) => {
			const sent = await onSubmitPrompt(value)
			if (sent && latestPrompt.current.trim() === value) {
				changePrompt("")
			}
		},
		[changePrompt, onSubmitPrompt],
	)

	const select = useCallback(
		(option: string) => {
			changePrompt(promptForCommand(option))
			composerRef.current?.focus({ preventScroll: true })
		},
		[changePrompt, composerRef],
	)

	const dismiss = useCallback(() => setWasDismissed(true), [])

	return (
		<PromptCommandMenu
			commands={options}
			open={query !== null && !isDismissed}
			query={query ?? ""}
			onSelect={select}
			onDismiss={dismiss}
		>
			<PromptInput
				textareaRef={composerRef}
				attachments={
					<PromptAttachments
						items={attachments}
						onRemove={onRemoveAttachment}
					/>
				}
				leading={
					<PromptAttachButton disabled={!canAttach} onAttach={onAttach} />
				}
				dropTarget={isDropTarget}
				onAttach={canAttach ? onAttach : undefined}
				onSubmit={submit}
				onValueChange={changePrompt}
				value={prompt}
				placeholder={t("screen.placeholder", { name: botName })}
			/>
		</PromptCommandMenu>
	)
})

function ConversationNotice({
	refusal,
	onDismissRefusal,
	error,
	onDismissError,
	onRestart,
}: {
	refusal: AttachmentStoreError | null
	onDismissRefusal: () => void
	error?: ChatError
	onDismissError: (id: string) => void
	onRestart: (id: string) => void
}) {
	const t = useChatCopy()

	if (refusal) {
		return (
			<ChatNotice
				tone="warning"
				title={t("screen.attachmentsRefused")}
				description={describeAttachmentError(t, refusal)}
				onDismiss={onDismissRefusal}
			/>
		)
	}
	if (!error) {
		return null
	}

	const stale = needsFreshSession(error.error)

	return (
		<ChatNotice
			tone={stale ? "error" : "warning"}
			title={noticeTitleFor(t, error.error)}
			description={describeTransportError(t, error.error)}
			retry={
				stale
					? {
							label: t("screen.restart"),
							onRetry: () => onRestart(error.id),
						}
					: undefined
			}
			onDismiss={() => onDismissError(error.id)}
		/>
	)
}

const HIGHLIGHT_MS = 2_000

const nextFrame = () =>
	new Promise<void>((resolve) => {
		requestAnimationFrame(() => resolve())
	})

type ChatScreenProps = {
	bot: Bot
	chat: Chat
	attachments: AttachmentsController
	readerName: string
	isSettingsOpen: boolean
	isOverlayOpen: boolean
	onToggleSettings: () => void
}

export function ChatScreen({
	bot,
	chat,
	attachments,
	readerName,
	isSettingsOpen,
	isOverlayOpen,
	onToggleSettings,
}: ChatScreenProps) {
	const t = useChatCopy()
	const { state, controller } = chat
	const composerRef = useRef<HTMLTextAreaElement>(null)
	const conversationRef = useRef<HTMLDivElement>(null)
	const scrollerRef = useRef<MessageScrollerHandle>(null)
	const drafts = useRef<Record<string, string>>({})
	const [dismissedErrorId, setDismissedErrorId] = useState<string | null>(null)
	const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null)
	const [highlightedMessageId, setHighlightedMessageId] = useState<string>()
	const heldHighlight = useRef<ReturnType<typeof setTimeout>>(undefined)
	const focusedBotId = useRef<string | null>(null)

	const face = avatarSrc(bot.avatarImagePath)
	const canAttach = isSessionReady(state)
	const owner = useMemo<AttachmentsOwner>(
		() => ({ kind: "bot", id: bot.id }),
		[bot.id],
	)
	const staged = useAttachments(attachments, owner, canAttach, conversationRef)
	const focusComposer = useCallback(() => {
		const composer = composerRef.current
		if (!composer || composer.disabled) {
			return
		}
		const caret = composer.value.length
		composer.focus({ preventScroll: true })
		composer.setSelectionRange(caret, caret)
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
	const readDraft = useCallback(() => drafts.current[bot.id] ?? "", [bot.id])
	const rememberDraft = useCallback(
		(draft: string) => {
			drafts.current[bot.id] = draft
		},
		[bot.id],
	)
	const submitPrompt = useCallback(
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
	const emptyStateStatus = emptyStateStatusFor(state.connection)
	const latestError = state.errors.at(-1)
	const notice = latestError?.id === dismissedErrorId ? undefined : latestError
	const runs = toRuns(toTranscriptRows(state.messages))
	const working = workingStateFor(state)

	const quotes = useQuotedMessages(controller, state.messages)
	const reader = readerName || t("working.name")
	const pins = usePinnedMessages(controller, state.conversationId)
	const botFace: BotFace = useMemo(
		() => ({
			name: bot.name,
			animal: bot.avatarAnimal,
			blot: bot.avatarBlot ?? undefined,
			seed: bot.id,
			image: face,
		}),
		[bot, face],
	)
	const pinnedRows = useMemo(
		() => pins.bubbles.map((shown) => toPinnedRow(shown, botFace, reader)),
		[pins.bubbles, botFace, reader],
	)

	const restart = useCallback(() => {
		void controller.restart()
	}, [controller])

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
			clearTimeout(heldHighlight.current)
			setHighlightedMessageId(messageId)
			heldHighlight.current = setTimeout(
				() => setHighlightedMessageId(undefined),
				HIGHLIGHT_MS,
			)
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

	useEffect(() => () => clearTimeout(heldHighlight.current), [])

	useEffect(() => {
		const claimed = claimsComposerFocus({
			botId: bot.id,
			focusedBotId: focusedBotId.current,
			isPromptPending: state.question !== null || state.permission !== null,
			isSettingsOpen,
			isOverlayOpen,
		})
		if (!claimed) {
			return
		}
		focusedBotId.current = bot.id
		focusComposer()
	}, [
		bot.id,
		state.question,
		state.permission,
		isSettingsOpen,
		isOverlayOpen,
		focusComposer,
	])

	const loadOlder = useCallback(() => {
		void controller.loadOlder()
	}, [controller])

	const stop = useCallback(() => {
		void controller.stop()
	}, [controller])

	return (
		<ChatLayout
			rootRef={conversationRef}
			scrollerRef={scrollerRef}
			transcriptKey={bot.id}
			busy={isTurnBusy(state.turn)}
			label={t("screen.label")}
			highlightedMessageId={highlightedMessageId}
			older={
				state.messages.length > 0
					? {
							has: state.hasOlder,
							isLoading: state.loadingOlder,
							onLoad: loadOlder,
						}
					: undefined
			}
			onFollowChange={controller.follow}
			header={
				<AppHeader
					data-tauri-drag-region="deep"
					leading={
						<HeaderIdentityButton
							animal={bot.avatarAnimal}
							blot={bot.avatarBlot ?? undefined}
							connection={state.connection}
							image={face}
							isSettingsOpen={isSettingsOpen}
							kind={working?.kind}
							name={bot.name}
							onOpenSettings={onToggleSettings}
							seed={bot.id}
							version={state.binaryVersion}
							working={working !== null}
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
			notice={
				<ConversationNotice
					refusal={staged.refusal}
					onDismissRefusal={staged.dismissRefusal}
					error={notice}
					onDismissError={setDismissedErrorId}
					onRestart={(id) => {
						setDismissedErrorId(id)
						restart()
					}}
				/>
			}
			reply={
				replyTarget
					? {
							...toQuote(replyTarget, { bot: bot.name, reader }, jumpToMessage),
							onDismiss: releaseReply,
						}
					: undefined
			}
			pending={
				<>
					{state.question ? (
						<QuestionPrompt controller={controller} request={state.question} />
					) : null}
					{state.permission ? (
						<PermissionPrompt
							controller={controller}
							request={state.permission}
						/>
					) : null}
				</>
			}
			composer={
				<Composer
					key={bot.id}
					composerRef={composerRef}
					readDraft={readDraft}
					onPromptChange={rememberDraft}
					botName={bot.name}
					commands={state.commands}
					canAttach={canAttach}
					isOverlayOpen={isOverlayOpen}
					attachments={staged.items}
					isDropTarget={staged.isDropTarget}
					onAttach={staged.stage}
					onRemoveAttachment={staged.remove}
					onSubmitPrompt={submitPrompt}
				/>
			}
		>
			{state.messages.length === 0 && emptyStateStatus ? (
				<ChatEmptyState
					className="m-auto"
					status={emptyStateStatus}
					onSetup={restart}
					name={bot.name}
					animal={bot.avatarAnimal}
					blot={bot.avatarBlot ?? undefined}
					seed={bot.id}
					image={face}
					onOpenSettings={onToggleSettings}
				/>
			) : null}

			{runs.map((run, runIndex) => {
				const newest = runIndex === runs.length - 1
				const live = working !== null && newest
				const avatarIndex = live ? -1 : run.length - 1

				return (
					<ChatTurnGroup
						key={bubbleIdOf(run[0].messageId, run[0].blockIndex)}
						carriesMark={newest}
					>
						{run.map((row, index) => {
							const bubble = bubbleIdOf(row.messageId, row.blockIndex)

							return (
								<TranscriptTurn
									key={bubble}
									row={row}
									controller={controller}
									avatar={index === avatarIndex}
									{...botFace}
									rejected={row.messageId === state.rejectedPromptId}
									reader={reader}
									anchor={bubble}
									quoted={
										row.quotedMessageId
											? quotes.get(row.quotedMessageId)
											: undefined
									}
									pinned={pins.isPinned(bubble)}
									onReply={holdReply}
									onJump={jumpToMessage}
									onPin={pins.toggle}
								/>
							)
						})}
					</ChatTurnGroup>
				)
			})}

			{working ? (
				<BotWorking
					animal={bot.avatarAnimal}
					botId={bot.id}
					blot={bot.avatarBlot ?? undefined}
					image={face}
					name={bot.name}
					kind={working.kind}
					label={working.label}
					seed={bot.id}
					onStop={canStopTurn(state.turn) ? stop : undefined}
				/>
			) : null}

			{state.outbox.length > 0 ? (
				<ChatTurnGroup>
					{state.outbox.map((entry) => (
						<QueuedTurn key={entry.id} entry={entry} controller={controller} />
					))}
				</ChatTurnGroup>
			) : null}
		</ChatLayout>
	)
}
