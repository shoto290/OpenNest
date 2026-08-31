import { type RefObject, useCallback, useMemo, useRef, useState } from "react"

import {
	ActivityIndicator,
	type ActivityIndicatorKind,
} from "@workspace/ui/components/activity-indicator"
import { AppHeader } from "@workspace/ui/components/app-header"
import { Avatar } from "@workspace/ui/components/avatar"
import { ChatEmptyState } from "@workspace/ui/components/chat-empty-state"
import { ConversationEmptyState } from "@workspace/ui/components/conversation-empty-state"
import { HeaderConversationButton } from "@workspace/ui/components/header-conversation-button"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import {
	MessageQuote,
	type QuotedMessage,
} from "@workspace/ui/components/message-quote"
import type {
	MessageScrollerHandle,
	MessageScrollerRow,
	MessageScrollerTrace,
} from "@workspace/ui/components/message-scroller"
import {
	PINNED_AVATAR_SIZE,
	type PinnedMessage,
	PinnedMessages,
} from "@workspace/ui/components/pinned-messages"
import { type RosterBot, RosterProvider } from "@workspace/ui/components/roster"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import { TurnGroup } from "@workspace/ui/components/turn"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { FaceAvatar } from "@/components/face-avatar"
import { BotComposer, ConversationComposer } from "@/components/thread-composer"
import {
	HandoverNotice,
	PinsNotice,
	ThreadNotice,
	TransportNotice,
} from "@/components/thread-notice"
import {
	ApprovalPrompt,
	QuestionPrompt,
	SpokenPrompt,
} from "@/components/thread-prompt"
import { QueuedTurn, RefusedTurn, ThreadTurn } from "@/components/thread-turn"
import type { AttachmentsOwner } from "@/lib/chat/attachments-contract"
import type { AttachmentsController } from "@/lib/chat/attachments-controller"
import type { ChatError } from "@/lib/chat/chat-state"
import { canStopTurn } from "@/lib/chat/chat-state"
import type { DraftsController } from "@/lib/chat/drafts-controller"
import { isTableBlock } from "@/lib/chat/markdown-blocks"
import { messageWithAttachments } from "@/lib/chat/message-attachments"
import { pinTimestamp } from "@/lib/chat/pin-timestamp"
import type { PinnedBubble } from "@/lib/chat/pinned-bubbles"
import {
	bubbleIdOf,
	emptyStateStatusFor,
	markedRunsOf,
	type ReplyTarget,
	type TranscriptRow,
	toRuns,
	toTranscriptRows,
} from "@/lib/chat/screen-model"
import {
	type ConversationThread,
	faceOfBot,
	factsOf,
	type LoadedBotThread,
	type LoadedConversationThread,
	type LoadedThread,
	type Thread,
	type ThreadAuthors,
	type ThreadFace,
	type ThreadQuotes,
} from "@/lib/chat/thread-contract"
import {
	type AskedBubble,
	useAskedQuestion,
} from "@/lib/chat/use-asked-question"
import type { StagedFiles } from "@/lib/chat/use-attachments"
import { useAttachments } from "@/lib/chat/use-attachments"
import {
	type PinnedBubbles,
	usePinnedMessages,
} from "@/lib/chat/use-pinned-messages"
import {
	type PromptResponder,
	usePromptResponder,
} from "@/lib/chat/use-prompt-responder"
import {
	NO_QUOTED_IDS,
	useQuotedMessages,
} from "@/lib/chat/use-quoted-messages"
import { useThreadJump } from "@/lib/chat/use-thread-jump"
import { useComposerFocus, useThreadReply } from "@/lib/chat/use-thread-reply"
import {
	type ThreadNaming,
	useThreadNaming,
	useThreadRoster,
} from "@/lib/chat/use-thread-roster"
import type { WorkingState } from "@/lib/chat/working-kind"
import { leadOf } from "@/lib/conversations/roster-conversations"
import { useConversation } from "@/lib/conversations/use-conversation"

const NO_MARKS: ReadonlySet<number> = new Set()

const logLandingTrace = (event: MessageScrollerTrace) => {
	console.info("transcript landing", event)
}

const landingTrace = import.meta.env.DEV ? logLandingTrace : undefined

type WorkingBotProps = {
	face: ThreadFace
	kind?: ActivityIndicatorKind
	label?: string
	onStop?: () => void
}

const WorkingBot = ({ face, kind, label, onStop }: WorkingBotProps) => (
	<ActivityIndicator
		animal={face.animal}
		blot={face.blot}
		botId={face.id}
		image={face.image}
		kind={kind}
		label={label}
		name={face.name}
		onStop={onStop}
		seed={face.id}
	/>
)

const toPinnedRow = (
	{ id, bubble }: PinnedBubble,
	face: ThreadFace | undefined,
	reader: string,
	toExcerpt: (text: string) => string,
): PinnedMessage => {
	const isBotAuthor = bubble.role === "assistant" && face !== undefined

	return {
		id,
		author: isBotAuthor ? face.name : reader,
		avatar: isBotAuthor ? (
			<FaceAvatar face={face} size={PINNED_AVATAR_SIZE} />
		) : (
			<Avatar name={reader} size={PINNED_AVATAR_SIZE} />
		),
		timestamp: pinTimestamp(bubble.timestamp),
		excerpt: toExcerpt(messageWithAttachments(bubble.text).text.trim()),
	}
}

type ThreadHeaderProps = {
	thread: LoadedThread
	botWork: WorkingState | null
	botImage?: string
	present: RosterBot[]
	pinnedRows: PinnedMessage[]
	onJumpToPin: (bubbleId: string) => void
	onUnpin: (bubbleId: string) => void
}

const ThreadHeader = ({
	thread,
	botWork,
	botImage,
	present,
	pinnedRows,
	onJumpToPin,
	onUnpin,
}: ThreadHeaderProps) => (
	<AppHeader
		data-tauri-drag-region="deep"
		leading={
			thread.kind === "bot" ? (
				<HeaderIdentityButton
					animal={thread.bot.avatarAnimal}
					blot={thread.bot.avatarBlot ?? undefined}
					connection={thread.state.connection}
					image={botImage}
					isSettingsOpen={thread.isSettingsOpen}
					kind={botWork?.kind}
					name={thread.bot.name}
					onOpenSettings={thread.onToggleSettings}
					seed={thread.bot.id}
					version={thread.state.binaryVersion}
					working={botWork !== null}
				/>
			) : (
				<HeaderConversationButton
					bots={present}
					isSettingsOpen={thread.isSettingsOpen}
					name={thread.conversation.title}
					onOpenSettings={() => thread.onOpenSettings(thread.conversation.id)}
				/>
			)
		}
		trailing={
			<PinnedMessages
				messages={pinnedRows}
				onJump={onJumpToPin}
				onUnpin={onUnpin}
			/>
		}
	/>
)

type ThreadComposerSlotProps = {
	thread: LoadedThread
	composerRef: RefObject<HTMLTextAreaElement | null>
	staged: StagedFiles
	canAttach: boolean
	present: RosterBot[]
	readDraft: () => string
	onPromptChange: (draft: string) => void
	onSubmitPrompt: (text: string) => Promise<boolean>
}

const ThreadComposerSlot = ({
	thread,
	composerRef,
	staged,
	canAttach,
	present,
	readDraft,
	onPromptChange,
	onSubmitPrompt,
}: ThreadComposerSlotProps) =>
	thread.kind === "bot" ? (
		<BotComposer
			attachments={staged.items}
			botName={thread.bot.name}
			canAttach={canAttach}
			commands={thread.state.commands}
			composerRef={composerRef}
			isDropTarget={staged.isDropTarget}
			isOverlayOpen={thread.isOverlayOpen}
			key={thread.bot.id}
			onAttach={staged.stage}
			onPromptChange={onPromptChange}
			onRemoveAttachment={staged.remove}
			onSubmitPrompt={onSubmitPrompt}
			readDraft={readDraft}
		/>
	) : (
		<ConversationComposer
			attachments={staged.items}
			bots={present}
			canAttach={canAttach}
			composerRef={composerRef}
			isDropTarget={staged.isDropTarget}
			key={thread.conversation.id}
			leadId={leadOf(thread.conversation)}
			onAttach={staged.stage}
			onPromptChange={onPromptChange}
			onRemoveAttachment={staged.remove}
			onSubmitPrompt={onSubmitPrompt}
			readDraft={readDraft}
		/>
	)

type ThreadApprovalProps = {
	thread: LoadedThread
	authors: ThreadAuthors
	responder: PromptResponder
}

const ThreadApproval = ({
	thread,
	authors,
	responder,
}: ThreadApprovalProps) => {
	if (thread.kind === "bot") {
		return thread.state.permission ? (
			<ApprovalPrompt request={thread.state.permission} responder={responder} />
		) : null
	}

	const prompt = thread.state.pendingPrompt
	return prompt?.kind === "permission" ? (
		<SpokenPrompt
			author={authors.get(prompt.botId)}
			prompt={prompt}
			responder={responder}
		/>
	) : null
}

type ThreadPendingProps = ThreadApprovalProps & {
	questionRecall?: QuotedMessage
}

const ThreadPending = ({
	thread,
	authors,
	responder,
	questionRecall,
}: ThreadPendingProps) => {
	const t = useChatCopy()

	return (
		<>
			{questionRecall ? (
				<MessageQuote
					{...questionRecall}
					label={t("screen.question.recall", {
						author: questionRecall.author,
					})}
					size="md"
				/>
			) : null}
			<ThreadApproval authors={authors} responder={responder} thread={thread} />
		</>
	)
}

type ThreadEmptyStateProps = {
	thread: LoadedThread
	botImage?: string
	present: RosterBot[]
	onRestart: () => void
}

const ThreadEmptyState = ({
	thread,
	botImage,
	present,
	onRestart,
}: ThreadEmptyStateProps) => {
	if (thread.kind === "conversation") {
		return thread.state.refusedMessage ? null : (
			<ConversationEmptyState
				bots={present}
				title={thread.conversation.title}
			/>
		)
	}

	const status = emptyStateStatusFor(thread.state.connection)

	return status ? (
		<ChatEmptyState
			animal={thread.bot.avatarAnimal}
			blot={thread.bot.avatarBlot ?? undefined}
			className="m-auto"
			image={botImage}
			name={thread.bot.name}
			onOpenSettings={thread.onToggleSettings}
			onSetup={onRestart}
			seed={thread.bot.id}
			status={status}
		/>
	) : null
}

type ThreadRunProps = {
	run: TranscriptRow[]
	carriesMark: boolean
	avatarIndex: number
	rejectedPromptId: string | null
	isSoloThread: boolean
	asked: AskedBubble | null
	responder: PromptResponder
	botFace: ThreadFace | null
	authors: ThreadAuthors
	quotes: ThreadQuotes
	pins: PinnedBubbles
	toQuote: ThreadNaming["toQuote"]
	onReply: (target: ReplyTarget) => void
	onRetry?: (messageId: string) => void
}

const ThreadRun = ({
	run,
	carriesMark,
	avatarIndex,
	rejectedPromptId,
	isSoloThread,
	asked,
	responder,
	botFace,
	authors,
	quotes,
	pins,
	toQuote,
	onReply,
	onRetry,
}: ThreadRunProps) => (
	<TurnGroup carriesMark={carriesMark}>
		{run.map((row, index) => {
			const bubble = bubbleIdOf(row.messageId, row.blockIndex)
			const asking = asked?.messageId === row.messageId ? asked : null

			return (
				<ThreadTurn
					anchor={bubble}
					asking={
						asking ? (
							<QuestionPrompt request={asking.request} responder={responder} />
						) : undefined
					}
					author={row.authorBotId ? authors.get(row.authorBotId) : undefined}
					avatarFace={
						index === avatarIndex ? (botFace ?? undefined) : undefined
					}
					bare={isSoloThread && isTableBlock(row.text)}
					botId={botFace?.id}
					key={bubble}
					onPin={pins.toggle}
					onReply={onReply}
					onRetry={onRetry}
					pinned={pins.isPinned(bubble)}
					quoted={
						row.quotedMessageId ? quotes.get(row.quotedMessageId) : undefined
					}
					row={row}
					state={row.messageId === rejectedPromptId ? "failed" : row.completion}
					toQuote={toQuote}
				/>
			)
		})}
	</TurnGroup>
)

type RunRowsProps = Omit<
	ThreadRunProps,
	"run" | "carriesMark" | "avatarIndex"
> & {
	runs: TranscriptRow[][]
	markedRuns: ReadonlySet<number>
	isWorking: boolean
}

const toRunRows = ({
	runs,
	markedRuns,
	isWorking,
	...shared
}: RunRowsProps): MessageScrollerRow[] => {
	const newestIndex = runs.length - 1

	return runs.map((run, runIndex) => {
		const newest = runIndex === newestIndex
		const live = isWorking && newest

		return {
			key: bubbleIdOf(run[0].messageId, run[0].blockIndex),
			messageIds: run.map((row) => bubbleIdOf(row.messageId, row.blockIndex)),
			render: () => (
				<ThreadRun
					{...shared}
					avatarIndex={shared.isSoloThread && !live ? run.length - 1 : -1}
					carriesMark={shared.isSoloThread ? newest : markedRuns.has(runIndex)}
					run={run}
				/>
			),
		}
	})
}

type BotThreadTailProps = {
	thread: LoadedBotThread
	face: ThreadFace
	botWork: WorkingState | null
	onStop: () => void
}

const BotThreadTail = ({
	thread,
	face,
	botWork,
	onStop,
}: BotThreadTailProps) => (
	<>
		{botWork ? (
			<WorkingBot
				face={face}
				kind={botWork.kind}
				label={botWork.label}
				onStop={canStopTurn(thread.state.turn) ? onStop : undefined}
			/>
		) : null}
		{thread.state.outbox.length > 0 ? (
			<TurnGroup>
				{thread.state.outbox.map((entry) => (
					<QueuedTurn
						controller={thread.controller}
						entry={entry}
						key={entry.id}
					/>
				))}
			</TurnGroup>
		) : null}
	</>
)

type ConversationThreadTailProps = {
	thread: LoadedConversationThread
	bots: RosterBot[]
	refusedQuote?: QuotedMessage
	onStop: () => void
}

const ConversationThreadTail = ({
	thread,
	bots,
	refusedQuote,
	onStop,
}: ConversationThreadTailProps) => {
	const seatedOf = (botId: string) => bots.find((seated) => seated.id === botId)
	const { refusedMessage, speakingBotId, speakingWork, waitingBotIds } =
		thread.state
	const speaking = speakingBotId ? seatedOf(speakingBotId) : undefined

	return (
		<>
			{refusedMessage ? (
				<RefusedTurn
					message={refusedMessage}
					onSendAgain={thread.controller.sendAgain}
					repliedTo={refusedQuote}
				/>
			) : null}
			{speaking ? (
				<WorkingBot
					face={speaking}
					kind={speakingWork?.kind}
					label={speakingWork?.label}
					onStop={onStop}
				/>
			) : null}
			{waitingBotIds
				.flatMap((botId) => seatedOf(botId) ?? [])
				.map((seated) => (
					<WorkingBot face={seated} key={seated.id} kind="waiting" />
				))}
		</>
	)
}

type ThreadTailProps = {
	thread: LoadedThread
	botWork: WorkingState | null
	bots: RosterBot[]
	refusedQuote?: QuotedMessage
	onStop: () => void
}

const ThreadTail = ({
	thread,
	botWork,
	bots,
	refusedQuote,
	onStop,
}: ThreadTailProps) =>
	thread.kind === "bot" ? (
		<BotThreadTail
			botWork={botWork}
			face={faceOfBot(thread.bot)}
			onStop={onStop}
			thread={thread}
		/>
	) : (
		<ConversationThreadTail
			bots={bots}
			onStop={onStop}
			refusedQuote={refusedQuote}
			thread={thread}
		/>
	)

type ThreadNoticesProps = {
	staged: StagedFiles
	pins: PinnedBubbles
	bots: RosterBot[]
	loopingPair: [string, string] | null
	error?: ChatError
	onDismissError: (id: string) => void
	onRestart?: (id: string) => void
	onStop: () => void
}

const ThreadNotices = ({
	staged,
	pins,
	bots,
	loopingPair,
	error,
	onDismissError,
	onRestart,
	onStop,
}: ThreadNoticesProps) => {
	const looping = loopingPair?.map((botId) =>
		bots.find((seated) => seated.id === botId),
	)

	return (
		<ThreadNotice
			onDismissRefusal={staged.dismissRefusal}
			refusal={staged.refusal}
		>
			{error ? (
				<TransportNotice
					error={error}
					onDismiss={onDismissError}
					onRestart={onRestart}
				/>
			) : null}
			{pins.hasFailed ? <PinsNotice onDismiss={pins.dismissFailure} /> : null}
			{looping?.[0] && looping[1] ? (
				<HandoverNotice onStop={onStop} pair={[looping[0], looping[1]]} />
			) : null}
		</ThreadNotice>
	)
}

type ThreadViewProps = {
	thread: LoadedThread
	attachments: AttachmentsController
	drafts: DraftsController
	readerName: string
}

function ThreadView({
	thread,
	attachments,
	drafts,
	readerName,
}: ThreadViewProps) {
	const t = useChatCopy()
	const { state, controller } = thread
	const facts = factsOf(thread)
	const composerRef = useRef<HTMLTextAreaElement>(null)
	const rootRef = useRef<HTMLDivElement>(null)
	const scrollerRef = useRef<MessageScrollerHandle>(null)
	const promptResponder = usePromptResponder(controller, scrollerRef)
	const [dismissedErrorId, setDismissedErrorId] = useState<string | null>(null)

	const reader = readerName || t("working.name")
	const roster = useThreadRoster(facts)
	const { bots, present, authors, botFace } = roster
	const botImage = botFace?.image
	const isSoloThread = facts.bot !== null

	const canAttach = facts.bot ? facts.isReady : present.length > 0
	const owner = useMemo<AttachmentsOwner>(
		() => ({ kind: facts.bot ? "bot" : "conversation", id: facts.id }),
		[facts.bot, facts.id],
	)
	const staged = useAttachments(attachments, owner, canAttach, rootRef)

	const repliedToRefusal = facts.refused?.repliedToMessageId
	const alsoQuoted = useMemo(
		() => (repliedToRefusal ? [repliedToRefusal] : NO_QUOTED_IDS),
		[repliedToRefusal],
	)
	const quotes = useQuotedMessages(
		facts.botController,
		state.messages,
		alsoQuoted,
	)
	const pins = usePinnedMessages(controller, state.conversationId)
	const { highlightedMessageId, jumpToMessage } = useThreadJump(
		controller,
		scrollerRef,
	)
	const { faceOf, toExcerpt, toQuote } = useThreadNaming({
		...roster,
		reader,
		unnamed: t("working.name"),
		isConversation: facts.conversation !== null,
		onJump: jumpToMessage,
	})

	const pinnedRows = useMemo(
		() =>
			pins.bubbles.map((shown) =>
				toPinnedRow(shown, faceOf(shown.bubble.authorBotId), reader, toExcerpt),
			),
		[pins.bubbles, faceOf, reader, toExcerpt],
	)

	const { replyTarget, focusComposer, holdReply, releaseReply, submitPrompt } =
		useThreadReply({ composerRef, scrollerRef, send: staged.submit })

	useComposerFocus({
		botId: facts.bot?.id ?? null,
		isPromptPending: facts.isPromptPending,
		isSettingsOpen: thread.isSettingsOpen,
		isOverlayOpen: facts.isOverlayOpen,
		focusComposer,
	})

	const { botController } = facts
	const readDraft = useCallback(() => drafts.read(facts.id), [drafts, facts.id])
	const rememberDraft = useCallback(
		(draft: string) => drafts.remember(facts.id, draft),
		[drafts, facts.id],
	)
	const restart = useCallback(() => {
		void botController?.restart()
	}, [botController])
	const retry = useCallback(
		(messageId: string) => {
			void botController?.retry(messageId)
		},
		[botController],
	)
	const restartAfterError = useCallback(
		(id: string) => {
			setDismissedErrorId(id)
			void botController?.restart()
		},
		[botController],
	)
	const stop = useCallback(() => {
		void controller.stop()
	}, [controller])
	const loadOlder = useCallback(() => {
		void controller.loadOlder()
	}, [controller])

	const { asked, recall } = useAskedQuestion({
		question: facts.question,
		messages: state.messages,
		toQuote,
	})

	const runs = toRuns(toTranscriptRows(state.messages))
	const markedRuns = isSoloThread
		? NO_MARKS
		: markedRunsOf(runs, facts.workingBotIds)
	const runRows = toRunRows({
		asked,
		authors,
		botFace,
		isSoloThread,
		isWorking: facts.botWork !== null,
		markedRuns,
		onReply: holdReply,
		onRetry: botController ? retry : undefined,
		pins,
		quotes,
		rejectedPromptId: facts.rejectedPromptId,
		responder: promptResponder,
		runs,
		toQuote,
	})
	const errorNotice =
		facts.latestError?.id === dismissedErrorId ? undefined : facts.latestError
	const refusedTarget = repliedToRefusal
		? quotes.get(repliedToRefusal)
		: undefined

	return (
		<RosterProvider bots={bots}>
			<ThreadLayout
				busy={facts.isBusy}
				composer={
					<ThreadComposerSlot
						canAttach={canAttach}
						composerRef={composerRef}
						onPromptChange={rememberDraft}
						onSubmitPrompt={submitPrompt}
						present={present}
						readDraft={readDraft}
						staged={staged}
						thread={thread}
					/>
				}
				header={
					<ThreadHeader
						botImage={botImage}
						botWork={facts.botWork}
						onJumpToPin={(bubbleId) => jumpToMessage(pins.anchorOf(bubbleId))}
						onUnpin={pins.unpin}
						pinnedRows={pinnedRows}
						present={present}
						thread={thread}
					/>
				}
				highlightedMessageId={highlightedMessageId}
				label={t("screen.label")}
				notice={
					<ThreadNotices
						bots={bots}
						error={errorNotice}
						loopingPair={facts.loopingPair}
						onDismissError={setDismissedErrorId}
						onRestart={botController ? restartAfterError : undefined}
						onStop={stop}
						pins={pins}
						staged={staged}
					/>
				}
				older={
					state.messages.length > 0
						? {
								has: state.hasOlder,
								isLoading: facts.isLoadingOlder,
								onLoad: loadOlder,
							}
						: undefined
				}
				onFollowChange={controller.follow}
				onLandingTrace={landingTrace}
				pending={
					<ThreadPending
						authors={authors}
						questionRecall={recall}
						responder={promptResponder}
						thread={thread}
					/>
				}
				reply={
					replyTarget
						? { ...toQuote(replyTarget), onDismiss: releaseReply }
						: undefined
				}
				rootRef={rootRef}
				rows={runRows}
				scrollerRef={scrollerRef}
				transcriptKey={facts.id}
			>
				{state.messages.length === 0 ? (
					<ThreadEmptyState
						botImage={botImage}
						onRestart={restart}
						present={present}
						thread={thread}
					/>
				) : null}

				<ThreadTail
					botWork={facts.botWork}
					bots={bots}
					onStop={stop}
					refusedQuote={refusedTarget ? toQuote(refusedTarget) : undefined}
					thread={thread}
				/>
			</ThreadLayout>
		</RosterProvider>
	)
}

type ThreadScreenProps = {
	thread: Thread
	attachments: AttachmentsController
	drafts: DraftsController
	readerName: string
}

type ConversationThreadViewProps = Omit<ThreadScreenProps, "thread"> & {
	thread: ConversationThread
}

function ConversationThreadView({
	thread,
	attachments,
	drafts,
	readerName,
}: ConversationThreadViewProps) {
	const { state, controller } = useConversation(
		thread.runtimes,
		thread.conversation,
	)

	return (
		<ThreadView
			attachments={attachments}
			drafts={drafts}
			readerName={readerName}
			thread={{ ...thread, state, controller }}
		/>
	)
}

export function ThreadScreen({
	thread,
	attachments,
	drafts,
	readerName,
}: ThreadScreenProps) {
	if (thread.kind === "conversation") {
		return (
			<ConversationThreadView
				attachments={attachments}
				drafts={drafts}
				key={thread.conversation.id}
				readerName={readerName}
				thread={thread}
			/>
		)
	}

	return (
		<ThreadView
			attachments={attachments}
			drafts={drafts}
			key={thread.bot.id}
			readerName={readerName}
			thread={{
				...thread,
				state: thread.chat.state,
				controller: thread.chat.controller,
			}}
		/>
	)
}
