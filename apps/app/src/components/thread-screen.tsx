import { type RefObject, useCallback, useEffect, useMemo, useRef } from "react"

import {
	ActivityIndicator,
	type ActivityIndicatorKind,
} from "@workspace/ui/components/activity-indicator"
import { AppHeader } from "@workspace/ui/components/app-header"
import { Avatar } from "@workspace/ui/components/avatar"
import type { BotStopProps } from "@workspace/ui/components/bot-identity-avatar"
import { ChatEmptyState } from "@workspace/ui/components/chat-empty-state"
import { ConversationEmptyState } from "@workspace/ui/components/conversation-empty-state"
import { HeaderConversationButton } from "@workspace/ui/components/header-conversation-button"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import {
	MessageQuote,
	type QuotedMessage,
} from "@workspace/ui/components/message-quote"
import {
	PINNED_AVATAR_SIZE,
	type PinnedMessage,
	PinnedMessages,
} from "@workspace/ui/components/pinned-messages"
import { type RosterBot, RosterProvider } from "@workspace/ui/components/roster"
import { RoutinesPanelTrigger } from "@workspace/ui/components/routines-panel"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import type {
	TranscriptHandle,
	TranscriptItem,
} from "@workspace/ui/components/transcript"
import { TurnGroup } from "@workspace/ui/components/turn"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { FaceAvatar } from "@/components/face-avatar"
import { ThreadComposer } from "@/components/thread-composer"
import { botThreadMenu, conversationThreadMenu } from "@/components/thread-menu"
import {
	HandoverNotice,
	PinsNotice,
	ThreadNotice,
	TransportNotice,
} from "@/components/thread-notice"
import {
	ApprovalPrompt,
	QuestionPrompt,
	SpokenApproval,
} from "@/components/thread-prompt"
import { ThreadRoutines } from "@/components/thread-routines"
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
	type ReplyTarget,
	type RunPresentation,
	runPresentationsOf,
	type TranscriptRow,
	toRuns,
	toTranscriptRows,
} from "@/lib/chat/screen-model"
import {
	type BotThread,
	type ConversationThread,
	faceOfBot,
	factsOf,
	type LoadedBotThread,
	type LoadedConversationThread,
	type LoadedThread,
	type Thread,
	type ThreadAuthors,
	type ThreadFace,
	type ThreadPermission,
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
import type { SpeakingBot } from "@/lib/conversations/conversation-controller"
import { leadOf } from "@/lib/conversations/roster-conversations"
import { useConversation } from "@/lib/conversations/use-conversation"
import type { ReportedRunsByTurnId } from "@/lib/routines/routine-contract"

type WorkingBotProps = BotStopProps & {
	face: ThreadFace
	kind?: ActivityIndicatorKind
	label?: string
}

const WorkingBot = ({ face, kind, label, ...stop }: WorkingBotProps) => (
	<ActivityIndicator
		{...stop}
		animal={face.animal}
		blot={face.blot}
		botId={face.id}
		image={face.image}
		kind={kind}
		label={label}
		name={face.name}
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
}: ThreadHeaderProps) => {
	const pinned = (
		<PinnedMessages
			messages={pinnedRows}
			onJump={onJumpToPin}
			onUnpin={onUnpin}
		/>
	)

	return (
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
				thread.kind === "conversation" ? (
					<>
						{pinned}
						<RoutinesPanelTrigger />
					</>
				) : (
					pinned
				)
			}
		/>
	)
}

type ThreadComposerSlotProps = {
	thread: LoadedThread
	composerRef: RefObject<HTMLTextAreaElement | null>
	staged: StagedFiles
	canAttach: boolean
	placeholder: string
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
	placeholder,
	present,
	readDraft,
	onPromptChange,
	onSubmitPrompt,
}: ThreadComposerSlotProps) => {
	const wiring =
		thread.kind === "bot"
			? botThreadMenu({
					commands: thread.state.commands,
					isOverlayOpen: thread.isOverlayOpen,
				})
			: conversationThreadMenu({
					bots: present,
					leadId: leadOf(thread.conversation),
				})

	return (
		<ThreadComposer
			{...wiring}
			key={thread.kind === "bot" ? thread.bot.id : thread.conversation.id}
			attachments={staged.items}
			canAttach={canAttach}
			composerRef={composerRef}
			isDropTarget={staged.isDropTarget}
			onAttach={staged.stage}
			onPromptChange={onPromptChange}
			onRemoveAttachment={staged.remove}
			onSubmitPrompt={onSubmitPrompt}
			placeholder={placeholder}
			readDraft={readDraft}
		/>
	)
}

type ThreadApprovalProps = {
	permission: ThreadPermission | null
	authors: ThreadAuthors
	responder: PromptResponder
}

const ThreadApproval = ({
	permission,
	authors,
	responder,
}: ThreadApprovalProps) => {
	if (!permission) {
		return null
	}

	const { request, authorBotId } = permission
	return authorBotId === null ? (
		<ApprovalPrompt request={request} responder={responder} />
	) : (
		<SpokenApproval
			author={authors.get(authorBotId)}
			request={request}
			responder={responder}
		/>
	)
}

type ThreadPendingProps = ThreadApprovalProps & {
	questionRecall?: QuotedMessage
}

const ThreadPending = ({
	permission,
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
			<ThreadApproval
				authors={authors}
				permission={permission}
				responder={responder}
			/>
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

const stopOf = (speaking: SpeakingBot) => () => {
	void speaking.stop()
}

type SpeakerStops = ReadonlyMap<string, () => void>

const NO_SPEAKER_STOPS: SpeakerStops = new Map()

const speakerStopsOf = (thread: LoadedThread): SpeakerStops =>
	thread.kind === "conversation"
		? new Map(
				thread.state.speakers.map((speaking) => [
					speaking.botId,
					stopOf(speaking),
				]),
			)
		: NO_SPEAKER_STOPS

const stopOfRow = (row: TranscriptRow, stops: SpeakerStops) =>
	row.authorBotId ? stops.get(row.authorBotId) : undefined

type ThreadRunProps = {
	run: TranscriptRow[]
	presentation: RunPresentation
	causes: ReportedRunsByTurnId
	rejectedPromptId: string | null
	asked: AskedBubble | null
	responder: PromptResponder
	botFace: ThreadFace | null
	authors: ThreadAuthors
	quotes: ThreadQuotes
	pins: PinnedBubbles
	toQuote: ThreadNaming["toQuote"]
	speakerStops: SpeakerStops
	onReply: (target: ReplyTarget) => void
	onRetry?: (messageId: string) => void
}

const ThreadRun = ({
	run,
	presentation,
	causes,
	rejectedPromptId,
	asked,
	responder,
	botFace,
	authors,
	quotes,
	pins,
	toQuote,
	speakerStops,
	onReply,
	onRetry,
}: ThreadRunProps) => (
	<TurnGroup carriesMark={presentation.isMarked}>
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
						index === presentation.avatarIndex
							? (botFace ?? undefined)
							: undefined
					}
					bare={presentation.hasBareTables && isTableBlock(row.text)}
					botId={botFace?.id}
					cause={causes.get(row.turnId)}
					key={bubble}
					onPin={pins.toggle}
					onReply={onReply}
					onRetry={onRetry}
					onStop={stopOfRow(row, speakerStops)}
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

type RunRowsProps = Omit<ThreadRunProps, "run" | "presentation"> & {
	runs: TranscriptRow[][]
	presentations: RunPresentation[]
}

const toRunRows = ({
	runs,
	presentations,
	...shared
}: RunRowsProps): TranscriptItem[] =>
	runs.map((run, runIndex) => ({
		key: bubbleIdOf(run[0].messageId, run[0].blockIndex),
		messageIds: run.map((row) => bubbleIdOf(row.messageId, row.blockIndex)),
		isAnchor: run[0].role === "user",
		render: () => (
			<ThreadRun {...shared} presentation={presentations[runIndex]} run={run} />
		),
	}))

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
}: BotThreadTailProps) => {
	const stop: BotStopProps = canStopTurn(thread.state.turn)
		? { stoppable: true, onStop }
		: {}

	return (
		<>
			{botWork ? (
				<WorkingBot
					{...stop}
					face={face}
					kind={botWork.kind}
					label={botWork.label}
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
}

type SpeakingRow = {
	seated: RosterBot
	speaking: SpeakingBot
}

const speakingRowsIn = (
	speakers: SpeakingBot[],
	bots: RosterBot[],
): SpeakingRow[] =>
	speakers.flatMap((speaking) => {
		const seated = bots.find(({ id }) => id === speaking.botId)
		return seated ? [{ seated, speaking }] : []
	})

const waitingRowsIn = (
	waitingBotIds: string[],
	speakers: SpeakingBot[],
	bots: RosterBot[],
): RosterBot[] =>
	waitingBotIds
		.filter((botId) => !speakers.some((speaking) => speaking.botId === botId))
		.flatMap((botId) => bots.find(({ id }) => id === botId) ?? [])

type ConversationThreadTailProps = {
	thread: LoadedConversationThread
	bots: RosterBot[]
	refusedQuote?: QuotedMessage
}

const ConversationThreadTail = ({
	thread,
	bots,
	refusedQuote,
}: ConversationThreadTailProps) => {
	const { refusedMessage, speakers, waitingBotIds } = thread.state

	return (
		<>
			{refusedMessage ? (
				<RefusedTurn
					message={refusedMessage}
					onSendAgain={thread.controller.sendAgain}
					repliedTo={refusedQuote}
				/>
			) : null}
			{speakingRowsIn(speakers, bots).map(({ seated, speaking }) => (
				<WorkingBot
					face={seated}
					key={seated.id}
					kind={speaking.work.kind}
					label={speaking.work.label}
					onStop={stopOf(speaking)}
					stoppable
				/>
			))}
			{waitingRowsIn(waitingBotIds, speakers, bots).map((seated) => (
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
	const scrollerRef = useRef<TranscriptHandle>(null)
	const promptResponder = usePromptResponder(controller, scrollerRef)

	const reader = readerName || t("working.name")
	const composerPlaceholder = facts.bot
		? t("screen.placeholder", { name: facts.bot.name })
		: t("composer.placeholder")
	const roster = useThreadRoster(facts)
	const { bots, present, authors, botFace } = roster
	const botImage = botFace?.image
	const isSoloThread = facts.bot !== null

	const owner = useMemo<AttachmentsOwner>(
		() => ({ kind: facts.bot ? "bot" : "conversation", id: facts.id }),
		[facts.bot, facts.id],
	)
	const staged = useAttachments(attachments, owner, facts.canAttach, rootRef)

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
			controller.dismissError(id)
			void botController?.restart()
		},
		[botController, controller],
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

	const runs = toRuns(toTranscriptRows(state.messages), facts.causes)
	const presentations = runPresentationsOf({
		runs,
		workingBotIds: facts.workingBotIds,
		hasSingleBot: isSoloThread,
		isWorking: facts.botWork !== null,
	})
	const runRows = toRunRows({
		asked,
		authors,
		botFace,
		causes: facts.causes,
		onReply: holdReply,
		onRetry: botController ? retry : undefined,
		pins,
		presentations,
		quotes,
		rejectedPromptId: facts.rejectedPromptId,
		responder: promptResponder,
		runs,
		speakerStops: speakerStopsOf(thread),
		toQuote,
	})
	const refusedTarget = repliedToRefusal
		? quotes.get(repliedToRefusal)
		: undefined

	const layout = (
		<ThreadLayout
			anchorOnSend={isSoloThread}
			busy={facts.isBusy}
			composer={
				<ThreadComposerSlot
					canAttach={facts.canAttach}
					composerRef={composerRef}
					onPromptChange={rememberDraft}
					onSubmitPrompt={submitPrompt}
					placeholder={composerPlaceholder}
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
					error={facts.latestError}
					loopingPair={facts.loopingPair}
					onDismissError={controller.dismissError}
					onRestart={botController ? restartAfterError : undefined}
					onStop={stop}
					pins={pins}
					staged={staged}
				/>
			}
			countsNewMessages={!isSoloThread}
			marksNewMessages={!isSoloThread}
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
			pending={
				<ThreadPending
					authors={authors}
					permission={facts.permission}
					questionRecall={recall}
					responder={promptResponder}
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
	)

	return (
		<RosterProvider bots={bots}>
			{facts.conversation ? (
				<ThreadRoutines
					conversationId={facts.conversation.id}
					leadBotId={leadOf(facts.conversation)}
				>
					{layout}
				</ThreadRoutines>
			) : (
				layout
			)}
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

type BotThreadViewProps = Omit<ThreadScreenProps, "thread"> & {
	thread: BotThread
}

function BotThreadView({
	thread,
	attachments,
	drafts,
	readerName,
}: BotThreadViewProps) {
	const { controller } = thread.chat
	const botId = thread.bot.id

	useEffect(() => () => controller.leave(botId), [controller, botId])

	return (
		<ThreadView
			attachments={attachments}
			drafts={drafts}
			readerName={readerName}
			thread={{ ...thread, state: thread.chat.state, controller }}
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
		<BotThreadView
			attachments={attachments}
			drafts={drafts}
			key={thread.bot.id}
			readerName={readerName}
			thread={thread}
		/>
	)
}
