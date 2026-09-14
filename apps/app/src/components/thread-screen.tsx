import {
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react"

import { ActivityIndicator } from "@workspace/ui/components/activity-indicator"
import { AppHeader } from "@workspace/ui/components/app-header"
import type { BotStopProps } from "@workspace/ui/components/bot-identity-avatar"
import { ChatEmptyState } from "@workspace/ui/components/chat-empty-state"
import { ConversationEmptyState } from "@workspace/ui/components/conversation-empty-state"
import { HeaderConversationButton } from "@workspace/ui/components/header-conversation-button"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import type { MessageAuthor } from "@workspace/ui/components/message"
import {
	MessageQuote,
	type QuotedMessage,
} from "@workspace/ui/components/message-quote"
import type { MissionBot } from "@workspace/ui/components/mission"
import { MissionEventRow } from "@workspace/ui/components/mission-event-row"
import { MissionHeader } from "@workspace/ui/components/mission-header"
import { MissionTurn } from "@workspace/ui/components/mission-turn"
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
	TranscriptNewer,
} from "@workspace/ui/components/transcript"
import { type TurnCauseKind, TurnGroup } from "@workspace/ui/components/turn"
import { type ChatCopy, useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { FaceAvatar } from "@/components/face-avatar"
import { ThreadComposer } from "@/components/thread-composer"
import { botThreadMenu, conversationThreadMenu } from "@/components/thread-menu"
import {
	ConnectorSessionNotice,
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
import {
	type ActivityPanel,
	ThreadRoutines,
} from "@/components/thread-routines"
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
import { isPostedAnswer } from "@/lib/chat/posted-question"
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
	type ThreadFacts,
	type ThreadMission,
	type ThreadPermission,
	type ThreadQuotes,
} from "@/lib/chat/thread-contract"
import {
	type AskedBubble,
	useAskedQuestion,
} from "@/lib/chat/use-asked-question"
import type { StagedFiles } from "@/lib/chat/use-attachments"
import { useAttachments } from "@/lib/chat/use-attachments"
import { useMessageLanding } from "@/lib/chat/use-message-landing"
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
import { type SentInMount, useSentInMount } from "@/lib/chat/use-sent-in-mount"
import { useThreadJump } from "@/lib/chat/use-thread-jump"
import { useComposerFocus, useThreadReply } from "@/lib/chat/use-thread-reply"
import {
	type ThreadNaming,
	useThreadNaming,
	useThreadRoster,
} from "@/lib/chat/use-thread-roster"
import type { WorkingState } from "@/lib/chat/working-kind"
import { useSessionConnector } from "@/lib/connectors/use-session-connector"
import type { SpeakingBot } from "@/lib/conversations/conversation-controller"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import { leadOf } from "@/lib/conversations/roster-conversations"
import type { Bot } from "@/lib/conversations/store-contract"
import type { TranscriptMessage } from "@/lib/conversations/transcript-contract"
import { useConversation } from "@/lib/conversations/use-conversation"
import type { Mission } from "@/lib/missions/mission-contract"
import type { SummonedMissionState } from "@/lib/missions/mission-summons"
import { toMissionFace } from "@/lib/missions/mission-thread-model"
import {
	BEFORE_FIRST_RUN,
	type MissionSummonsCause,
	type PlacedMission,
	type PlacedMissionEvent,
	placeMissionEvents,
	placeMissions,
	withoutMissionSummons,
} from "@/lib/missions/mission-transcript"
import { toMissionCard } from "@/lib/missions/missions-model"
import { useMissionSendFailure } from "@/lib/missions/use-mission-failure-notices"
import { useMissions } from "@/lib/missions/use-missions"
import { withoutOnboardingSummons } from "@/lib/onboarding/onboarding-summons"
import {
	type OnboardingTail,
	onboardingTailOf,
	signInTailOf,
} from "@/lib/onboarding/onboarding-tail"
import type { Onboarding } from "@/lib/onboarding/use-onboarding"
import { usePostedOnboardingStep } from "@/lib/onboarding/use-posted-onboarding-step"
import type { SignIn } from "@/lib/onboarding/use-sign-in"
import type { ReportedRun } from "@/lib/routines/routine-contract"
import type { MessageLandingController } from "@/lib/search/message-landing-controller"

type WorkingBotProps = BotStopProps & {
	face: ThreadFace
	work: WorkingState
}

const WorkingBot = ({ face, work, ...stop }: WorkingBotProps) => (
	<ActivityIndicator
		{...stop}
		animal={face.animal}
		blot={face.blot}
		botId={face.id}
		image={face.image}
		kind={work.kind}
		label={work.label}
		name={face.name}
		seed={face.id}
		startedAt={work.startedAt}
		waitingOn={work.waitingOn}
	/>
)

const UP_NEXT: WorkingState = { kind: "waiting", waitingOn: "next" }

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
			<InitialsAvatar name={reader} size={PINNED_AVATAR_SIZE} />
		),
		timestamp: pinTimestamp(bubble.timestamp),
		excerpt: toExcerpt(messageWithAttachments(bubble.text).text.trim()),
	}
}

type RoutinesScope = {
	conversationId: string | null
	leadBotId?: string
}

const NO_ROUTINES: RoutinesScope = { conversationId: null }

const routinesScopeOf = (
	facts: ThreadFacts,
	mainConversationId: string | null,
): RoutinesScope => {
	if (facts.mission) {
		return NO_ROUTINES
	}

	return facts.conversation
		? {
				conversationId: facts.conversation.id,
				leadBotId: leadOf(facts.conversation),
			}
		: { conversationId: mainConversationId, leadBotId: facts.bot?.id }
}

const speakerIdOf = (thread: LoadedThread, error: ChatError | undefined) =>
	thread.kind === "bot" ? thread.bot.id : error?.botId

const isClosedMission = (seat: ThreadMission | null): boolean =>
	seat !== null && seat.mission.closedAt !== null

const composerPlaceholderOf = (facts: ThreadFacts, t: ChatCopy): string => {
	if (facts.mission) {
		return t("missions.composer.placeholder")
	}

	return facts.bot
		? t("screen.placeholder", { name: facts.bot.name })
		: t("composer.placeholder")
}

type ThreadHeaderProps = {
	thread: LoadedThread
	mission: ThreadMission | null
	botWork: WorkingState | null
	botImage?: string
	present: RosterBot[]
	pinnedRows: PinnedMessage[]
	hasRoutines: boolean
	onJumpToPin: (bubbleId: string) => void
	onUnpin: (bubbleId: string) => void
}

const ThreadHeader = ({
	thread,
	mission,
	botWork,
	botImage,
	present,
	pinnedRows,
	hasRoutines,
	onJumpToPin,
	onUnpin,
}: ThreadHeaderProps) => {
	const missionFace = mission
		? present.find(({ id }) => id === mission.mission.botId)
		: undefined

	if (mission && missionFace) {
		return (
			<MissionHeader
				bot={toMissionFace(missionFace)}
				now={mission.now}
				objective={mission.mission.objective}
				onBack={mission.onLeave}
				openedAt={mission.mission.openedAt}
				state={mission.mission.state}
				ticket={mission.mission.ticket}
				tools={mission.mission.tools}
			/>
		)
	}

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
				hasRoutines ? (
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
	isDisabled: boolean
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
	isDisabled,
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
			isDisabled={isDisabled}
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
	latestError?: ChatError
	onRestart: () => void
	onSignIn?: () => void
}

const ThreadEmptyState = ({
	thread,
	botImage,
	present,
	latestError,
	onRestart,
	onSignIn,
}: ThreadEmptyStateProps) => {
	if (thread.kind === "conversation") {
		return thread.state.refusedMessage ? null : (
			<ConversationEmptyState
				bots={present}
				title={thread.conversation.title}
			/>
		)
	}

	const status = emptyStateStatusFor(
		thread.state.connection,
		latestError?.error,
	)

	return status ? (
		<ChatEmptyState
			animal={thread.bot.avatarAnimal}
			blot={thread.bot.avatarBlot ?? undefined}
			className="m-auto"
			image={botImage}
			name={thread.bot.name}
			onOpenSettings={thread.onToggleSettings}
			onSetup={onRestart}
			onSignIn={onSignIn}
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
	causes: ThreadCauses
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

type ThreadCause = ReportedRun & { kind?: TurnCauseKind }

type ThreadCauses = ReadonlyMap<string, ThreadCause>

const SUMMONS_TRIGGER_SOURCE = "mission"

const SUMMONS_CAUSE_KEY = {
	working: "missions.summons.working",
	waiting_bot: "missions.summons.waiting_bot",
} as const satisfies Record<SummonedMissionState, string>

const withSummonsCauses = (
	causes: ThreadCauses,
	summonsCauses: MissionSummonsCause[],
	t: ChatCopy,
): ThreadCauses =>
	new Map([
		...causes,
		...summonsCauses.map(({ turnId, state }): [string, ThreadCause] => [
			turnId,
			{
				turnId,
				kind: "mission",
				routineTitle: t(SUMMONS_CAUSE_KEY[state]),
				triggerSourceId: SUMMONS_TRIGGER_SOURCE,
			},
		]),
	])

type ReadRunsProps = {
	messages: TranscriptMessage[]
	missionSeat: ThreadMission | null
	isSoloThread: boolean
	causes: ThreadCauses
	t: ChatCopy
}

type ReadRuns = {
	runs: TranscriptRow[][]
	causes: ThreadCauses
}

const readRuns = ({
	messages,
	missionSeat,
	isSoloThread,
	causes,
	t,
}: ReadRunsProps): ReadRuns => {
	const rows = toTranscriptRows(messages)
	if (!missionSeat) {
		const kept = isSoloThread ? withoutOnboardingSummons(rows) : rows
		return { runs: toRuns(kept, causes), causes }
	}
	const summoned = withoutMissionSummons(rows, missionSeat.mission.botId)
	const summonedCauses = withSummonsCauses(causes, summoned.summonsCauses, t)

	return {
		runs: toRuns(summoned.rows, summonedCauses),
		causes: summonedCauses,
	}
}

type RunRowsProps = Omit<ThreadRunProps, "run" | "presentation"> & {
	runs: TranscriptRow[][]
	presentations: RunPresentation[]
	isSentInMount: SentInMount["isSentInMount"]
}

const isSentByReader = (row: TranscriptRow) =>
	row.role === "user" && !isPostedAnswer(row)

const toRunRows = ({
	runs,
	presentations,
	isSentInMount,
	...shared
}: RunRowsProps): TranscriptItem[] =>
	runs.map((run, runIndex) => ({
		key: bubbleIdOf(run[0].messageId, run[0].blockIndex),
		messageIds: run.map((row) => bubbleIdOf(row.messageId, row.blockIndex)),
		isAnchor: run.some(
			(row) => isSentByReader(row) && isSentInMount(row.messageId),
		),
		render: () => (
			<ThreadRun {...shared} presentation={presentations[runIndex]} run={run} />
		),
	}))

const interleavedWithRuns = <Placed extends { runIndex: number }>(
	runRows: TranscriptItem[],
	placed: Placed[],
	toRows: (placed: Placed) => TranscriptItem[],
): TranscriptItem[] => {
	const rowsAfter = (runIndex: number) =>
		placed.filter((one) => one.runIndex === runIndex).flatMap(toRows)

	return [
		...rowsAfter(BEFORE_FIRST_RUN),
		...runRows.flatMap((runRow, runIndex) => [runRow, ...rowsAfter(runIndex)]),
	]
}

type MissionCardRowsProps = {
	runRows: TranscriptItem[]
	placed: PlacedMission[]
	authors: ThreadAuthors
	faceOf: ThreadNaming["faceOf"]
	onOpen: (missionId: string) => void
}

const toMissionCardRow = (
	mission: Mission,
	identity: ThreadFace,
	author: MessageAuthor | undefined,
	onOpen: (missionId: string) => void,
): TranscriptItem => ({
	key: `mission-${mission.id}`,
	render: () => (
		<MissionTurn
			mission={toMissionCard(mission, identity, author)}
			onOpen={onOpen}
		/>
	),
})

const withMissionCards = ({
	runRows,
	placed,
	authors,
	faceOf,
	onOpen,
}: MissionCardRowsProps): TranscriptItem[] =>
	interleavedWithRuns(runRows, placed, ({ mission }) => {
		const identity = faceOf(mission.botId)
		if (!identity) {
			return []
		}
		return [
			toMissionCardRow(mission, identity, authors.get(mission.botId), onOpen),
		]
	})

type MissionEventRowsProps = {
	runRows: TranscriptItem[]
	placed: PlacedMissionEvent[]
	tools: string[]
	bot?: MissionBot
	now: number
}

const withMissionEvents = ({
	runRows,
	placed,
	tools,
	bot,
	now,
}: MissionEventRowsProps): TranscriptItem[] =>
	interleavedWithRuns(runRows, placed, ({ event }) => [
		{
			key: `mission-event-${event.id}`,
			render: () => (
				<MissionEventRow bot={bot} event={event} now={now} tools={tools} />
			),
		},
	])

type BotThreadTailProps = {
	thread: LoadedBotThread
	face: ThreadFace
	botWork: WorkingState | null
	onboarding: OnboardingTail | null
	onStop: () => void
}

const BotThreadTail = ({
	thread,
	face,
	botWork,
	onboarding,
	onStop,
}: BotThreadTailProps) => {
	const stop: BotStopProps = canStopTurn(thread.state.turn)
		? { stoppable: true, onStop }
		: {}
	usePostedOnboardingStep({
		controller: thread.controller,
		botId: thread.bot.id,
		pendingId: thread.state.question?.id ?? null,
		step: onboarding?.step ?? null,
	})

	return (
		<>
			{botWork ? <WorkingBot {...stop} face={face} work={botWork} /> : null}
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
					onStop={stopOf(speaking)}
					stoppable
					work={speaking.work}
				/>
			))}
			{waitingRowsIn(waitingBotIds, speakers, bots).map((seated) => (
				<WorkingBot face={seated} key={seated.id} work={UP_NEXT} />
			))}
		</>
	)
}

const onboardingTailFor = (
	thread: LoadedThread,
	onboarding: Onboarding | undefined,
	signIn: SignIn | undefined,
): OnboardingTail | null =>
	thread.kind === "bot"
		? (onboardingTailOf(onboarding, thread.state, thread.bot.id) ??
			signInTailOf(signIn, thread.bot.id))
		: null

const signInOfferOf = (
	signIn: SignIn | undefined,
	botId: string | undefined,
) => (signIn && botId ? () => signIn.controller.offer(botId) : undefined)

const showsEmptyState = (
	rows: TranscriptItem[],
	onboarding: OnboardingTail | null,
) => rows.length === 0 && !onboarding

type ThreadTailProps = {
	thread: LoadedThread
	botWork: WorkingState | null
	bots: RosterBot[]
	onboarding: OnboardingTail | null
	refusedQuote?: QuotedMessage
	onStop: () => void
}

const ThreadTail = ({
	thread,
	botWork,
	bots,
	onboarding,
	refusedQuote,
	onStop,
}: ThreadTailProps) =>
	thread.kind === "bot" ? (
		<BotThreadTail
			botWork={botWork}
			face={faceOfBot(thread.bot)}
			onboarding={onboarding}
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
	speakerId?: string
	onDismissError: (id: string) => void
	onRestart?: (id: string) => void
	onSignIn?: () => void
	onStop: () => void
}

const ThreadNotices = ({
	staged,
	pins,
	bots,
	loopingPair,
	error,
	speakerId,
	onDismissError,
	onRestart,
	onSignIn,
	onStop,
}: ThreadNoticesProps) => {
	const leftOut = useSessionConnector(error, speakerId)
	const looping = loopingPair?.map((botId) =>
		bots.find((seated) => seated.id === botId),
	)

	return (
		<ThreadNotice
			onDismissRefusal={staged.dismissRefusal}
			refusal={staged.refusal}
		>
			{error && leftOut ? (
				<ConnectorSessionNotice
					name={leftOut.name}
					onDismiss={() => onDismissError(error.id)}
					onOpen={leftOut.open}
				/>
			) : null}
			{error && !leftOut ? (
				<TransportNotice
					error={error}
					onDismiss={onDismissError}
					onRestart={onRestart}
					onSignIn={onSignIn}
				/>
			) : null}
			{pins.hasFailed ? <PinsNotice onDismiss={pins.dismissFailure} /> : null}
			{looping?.[0] && looping[1] ? (
				<HandoverNotice onStop={onStop} pair={[looping[0], looping[1]]} />
			) : null}
		</ThreadNotice>
	)
}

type NewerControl = {
	hasNewer: boolean
	isLoading: boolean
	onLoad: () => void
	onLoadLatest: () => void
}

const newerControlOf = ({
	hasNewer,
	isLoading,
	onLoad,
	onLoadLatest,
}: NewerControl): TranscriptNewer | undefined =>
	hasNewer ? { isLoading, onLoad, onLoadLatest } : undefined

type ThreadViewProps = {
	activityPanel: ActivityPanel
	thread: LoadedThread
	bots: Bot[]
	runtimes: ConversationRuntimes
	attachments: AttachmentsController
	drafts: DraftsController
	landings: MessageLandingController
	readerName: string
	onboarding?: Onboarding
	signIn?: SignIn
	onOpenMission: (missionId: string) => void
}

function ThreadView({
	activityPanel,
	thread,
	bots: known,
	runtimes,
	attachments,
	drafts,
	landings,
	readerName,
	onboarding,
	signIn,
	onOpenMission,
}: ThreadViewProps) {
	const t = useChatCopy()
	const { state, controller } = thread
	const facts = factsOf(thread)
	const composerRef = useRef<HTMLTextAreaElement>(null)
	const rootRef = useRef<HTMLDivElement>(null)
	const scrollerRef = useRef<TranscriptHandle>(null)
	const promptResponder = usePromptResponder(controller, scrollerRef)

	const reader = readerName || t("working.name")
	const missionSeat = facts.mission
	const isMissionClosed = isClosedMission(missionSeat)
	const composerPlaceholder = composerPlaceholderOf(facts, t)
	const roster = useThreadRoster({ ...facts, bots: known })
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
	const routinesScope = routinesScopeOf(facts, state.conversationId)
	const missions = useMissions(routinesScope.conversationId)
	const { highlightedMessageId, jumpToMessage, landOnMessage } = useThreadJump(
		controller,
		scrollerRef,
	)
	const landing = useSyncExternalStore(landings.subscribe, landings.getState)

	useMessageLanding({
		conversationId: state.conversationId,
		landOn: controller.landOn,
		landing,
		messages: state.messages,
		onLand: landOnMessage,
		onTaken: landings.forget,
	})
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

	const { send, isSentInMount } = useSentInMount({
		threadId: facts.id,
		messages: state.messages,
		send: staged.submit,
	})
	const { replyTarget, focusComposer, holdReply, releaseReply, submitPrompt } =
		useThreadReply({ composerRef, scrollerRef, send })

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
	const offerSignIn = signInOfferOf(signIn, facts.bot?.id)
	const stop = useCallback(() => {
		void controller.stop()
	}, [controller])
	const loadOlder = useCallback(() => {
		void controller.loadOlder()
	}, [controller])
	const loadNewer = useCallback(() => {
		void controller.loadNewer()
	}, [controller])
	const loadLatest = useCallback(() => {
		void controller.loadLatest().then((isLoaded) => {
			if (isLoaded) {
				scrollerRef.current?.scrollToEnd()
			}
		})
	}, [controller])
	const hasNewer = state.hasNewer

	const { asked, recall } = useAskedQuestion({
		question: facts.question,
		messages: state.messages,
		toQuote,
	})

	const { runs, causes } = readRuns({
		messages: state.messages,
		missionSeat,
		isSoloThread,
		causes: facts.causes,
		t,
	})
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
		causes,
		isSentInMount,
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
	const missionFace = missionSeat
		? present.find(({ id }) => id === missionSeat.mission.botId)
		: undefined
	const transcriptRows = missionSeat
		? withMissionEvents({
				bot: missionFace ? toMissionFace(missionFace) : undefined,
				now: missionSeat.now,
				placed: placeMissionEvents(runs, missionSeat.events),
				runRows,
				tools: missionSeat.mission.tools,
			})
		: withMissionCards({
				authors,
				faceOf,
				onOpen: onOpenMission,
				placed: placeMissions({
					hasOlder: state.hasOlder,
					missions: missions.missions,
					runs,
				}),
				runRows,
			})
	const refusedTarget = repliedToRefusal
		? quotes.get(repliedToRefusal)
		: undefined
	const onboardingTail = onboardingTailFor(thread, onboarding, signIn)

	const layout = (
		<ThreadLayout
			anchorOnSend={isSoloThread}
			busy={facts.isBusy}
			composer={
				<ThreadComposerSlot
					canAttach={facts.canAttach && !isMissionClosed}
					composerRef={composerRef}
					isDisabled={isMissionClosed}
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
					hasRoutines={routinesScope.conversationId !== null}
					mission={missionSeat}
					onJumpToPin={(bubbleId) => jumpToMessage(pins.anchorOf(bubbleId))}
					onUnpin={pins.unpin}
					pinnedRows={pinnedRows}
					present={present}
					thread={thread}
				/>
			}
			highlightedMessageId={highlightedMessageId}
			label={missionSeat ? t("missions.feed.label") : t("screen.label")}
			notice={
				<ThreadNotices
					bots={bots}
					error={facts.latestError}
					speakerId={speakerIdOf(thread, facts.latestError)}
					loopingPair={facts.loopingPair}
					onDismissError={controller.dismissError}
					onRestart={botController ? restartAfterError : undefined}
					onSignIn={offerSignIn}
					onStop={stop}
					pins={pins}
					staged={staged}
				/>
			}
			countsNewMessages={!isSoloThread}
			marksNewMessages={!isSoloThread}
			newer={newerControlOf({
				hasNewer,
				isLoading: facts.isLoadingNewer,
				onLoad: loadNewer,
				onLoadLatest: loadLatest,
			})}
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
			rows={transcriptRows}
			scrollerRef={scrollerRef}
			transcriptKey={facts.id}
		>
			{showsEmptyState(transcriptRows, onboardingTail) ? (
				<ThreadEmptyState
					botImage={botImage}
					latestError={facts.latestError}
					onRestart={restart}
					onSignIn={offerSignIn}
					present={present}
					thread={thread}
				/>
			) : null}

			<ThreadTail
				botWork={facts.botWork}
				bots={bots}
				onboarding={onboardingTail}
				onStop={stop}
				refusedQuote={refusedTarget ? toQuote(refusedTarget) : undefined}
				thread={thread}
			/>
		</ThreadLayout>
	)

	return (
		<RosterProvider bots={bots}>
			<ThreadRoutines
				{...routinesScope}
				activityPanel={activityPanel}
				faceOf={faceOf}
				missions={missions}
				onOpenMission={onOpenMission}
				runtimes={runtimes}
			>
				{layout}
			</ThreadRoutines>
		</RosterProvider>
	)
}

type ThreadScreenProps = {
	activityPanel: ActivityPanel
	thread: Thread
	bots: Bot[]
	runtimes: ConversationRuntimes
	attachments: AttachmentsController
	drafts: DraftsController
	landings: MessageLandingController
	readerName: string
	onboarding?: Onboarding
	signIn?: SignIn
	onOpenMission: (missionId: string) => void
}

type ConversationThreadViewProps = Omit<ThreadScreenProps, "thread"> & {
	thread: ConversationThread
}

function ConversationThreadView({
	activityPanel,
	thread,
	bots,
	runtimes,
	attachments,
	drafts,
	landings,
	readerName,
	onOpenMission,
}: ConversationThreadViewProps) {
	const { state, controller } = useConversation(
		thread.runtimes,
		thread.conversation,
	)

	useMissionSendFailure(thread.mission ? state.refusedMessage : null)

	return (
		<ThreadView
			activityPanel={activityPanel}
			attachments={attachments}
			bots={bots}
			drafts={drafts}
			landings={landings}
			onOpenMission={onOpenMission}
			readerName={readerName}
			runtimes={runtimes}
			thread={{ ...thread, state, controller }}
		/>
	)
}

type BotThreadViewProps = Omit<ThreadScreenProps, "thread"> & {
	thread: BotThread
}

function BotThreadView({
	activityPanel,
	thread,
	bots,
	runtimes,
	attachments,
	drafts,
	landings,
	readerName,
	onboarding,
	signIn,
	onOpenMission,
}: BotThreadViewProps) {
	const { controller } = thread.chat
	const botId = thread.bot.id

	useEffect(() => {
		controller.enter(botId)
		return () => controller.leave(botId)
	}, [controller, botId])

	return (
		<ThreadView
			activityPanel={activityPanel}
			attachments={attachments}
			bots={bots}
			drafts={drafts}
			landings={landings}
			onboarding={onboarding}
			onOpenMission={onOpenMission}
			readerName={readerName}
			runtimes={runtimes}
			signIn={signIn}
			thread={{ ...thread, state: thread.chat.state, controller }}
		/>
	)
}

export function ThreadScreen({
	activityPanel,
	thread,
	bots,
	runtimes,
	attachments,
	drafts,
	landings,
	readerName,
	onboarding,
	signIn,
	onOpenMission,
}: ThreadScreenProps) {
	if (thread.kind === "conversation") {
		return (
			<ConversationThreadView
				activityPanel={activityPanel}
				attachments={attachments}
				bots={bots}
				drafts={drafts}
				key={thread.conversation.id}
				landings={landings}
				onOpenMission={onOpenMission}
				readerName={readerName}
				runtimes={runtimes}
				thread={thread}
			/>
		)
	}

	return (
		<BotThreadView
			activityPanel={activityPanel}
			attachments={attachments}
			bots={bots}
			drafts={drafts}
			key={thread.bot.id}
			landings={landings}
			onboarding={onboarding}
			onOpenMission={onOpenMission}
			readerName={readerName}
			runtimes={runtimes}
			signIn={signIn}
			thread={thread}
		/>
	)
}
