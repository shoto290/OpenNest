import { memo, type Ref, useCallback, useEffect, useRef, useState } from "react"

import { AgentActivity } from "@workspace/ui/components/agent-activity"
import { AppHeader } from "@workspace/ui/components/app-header"
import { BotAvatar } from "@workspace/ui/components/bot-avatar"
import {
	BotWorking,
	type BotWorkingKind,
} from "@workspace/ui/components/bot-working"
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
import { ConnectionStatus } from "@workspace/ui/components/connection-status"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import {
	ToolApproval,
	ToolApprovalCode,
} from "@workspace/ui/components/tool-approval"

import type { ChatController } from "@/lib/chat/chat-controller"
import { canStopTurn, isSessionReady, isTurnBusy } from "@/lib/chat/chat-state"
import {
	activityStatusFor,
	emptyStateStatusFor,
	needsFreshSession,
	noticeTitleFor,
	type TranscriptRow,
	toActivityItems,
	toRuns,
	toTranscriptRows,
	workingStateFor,
} from "@/lib/chat/screen-model"
import type { Chat } from "@/lib/chat/use-chat"
import type {
	ActivityEvent,
	PermissionRequest,
	TurnState,
} from "@/lib/claude/contract"
import { describeTransportError } from "@/lib/claude/messages"
import type {
	AvatarAnimal,
	AvatarPose,
	Bot,
} from "@/lib/conversations/store-contract"

/** Memoised: a streamed delta rewrites one message, and the view model hands
 * back the same rows for the rest. `run` arrives from the enclosing group and
 * `avatar` stays a boolean, so the shallow compare holds through a stream — which
 * is also why the bot's face arrives as its two words rather than as a node. */
const TranscriptTurn = memo(function TranscriptTurn({
	row,
	controller,
	run,
	avatar,
	animal,
	pose,
	rejected,
}: {
	row: TranscriptRow
	controller: ChatController
	run?: ChatTurnRun
	avatar: boolean
	animal: AvatarAnimal
	pose: AvatarPose
	/** Claude refused this prompt. The stored row is whole either way — the reader
	 * wrote it and the store took it — so the retry lives on the screen alone. */
	rejected?: boolean
}) {
	if (row.role === "user") {
		return (
			<UserTurn
				state={rejected ? "failed" : row.completion}
				run={run}
				copyText={row.text}
				onRetry={() => {
					void controller.retry(row.messageId)
				}}
			>
				{row.text}
			</UserTurn>
		)
	}

	return (
		<AssistantTurn
			state={row.completion}
			run={run}
			copyText={row.text}
			avatar={
				avatar ? (
					<BotAvatar
						animal={animal}
						animated={false}
						size={CHAT_AVATAR_SIZE}
						state={pose}
					/>
				) : null
			}
		>
			{row.text}
		</AssistantTurn>
	)
})

/** Memoised: the layout-animated rows re-measure on commit, and a text delta
 * leaves `activities` untouched. */
const ActivityLog = memo(function ActivityLog({
	activities,
	turn,
	workingKind,
}: {
	activities: ActivityEvent[]
	turn: TurnState
	workingKind?: BotWorkingKind
}) {
	const items = toActivityItems(activities)

	return (
		<AgentActivity
			items={items}
			status={activityStatusFor(turn)}
			// The rows below already name the step, so the header only says how the
			// bot is busy.
			renderWorkingStatus={() => <BotWorking kind={workingKind} />}
			summary={`Ran ${items.length} ${items.length === 1 ? "step" : "steps"}`}
		/>
	)
})

function PermissionPrompt({
	controller,
	request,
}: {
	controller: ChatController
	request: PermissionRequest
}) {
	const isShell = request.toolName === "Bash"

	return (
		<ToolApproval
			tool={request.toolName}
			title={request.title}
			description="Claude Code is waiting on you before it runs this tool."
			parameters={
				request.detail && !isShell
					? [{ id: "path", label: "Path", value: request.detail }]
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

/** Memoised: the draft mirror and the send/stop icon swap must not re-render per token. */
const Composer = memo(function Composer({
	controller,
	composerRef,
	disabled,
	turn,
}: {
	controller: ChatController
	composerRef: Ref<HTMLTextAreaElement>
	disabled: boolean
	turn: TurnState
}) {
	const stop = useCallback(() => {
		void controller.stop()
	}, [controller])

	const submit = useCallback(
		(prompt: string) => {
			void controller.send(prompt)
		},
		[controller],
	)

	return (
		<PromptInput
			textareaRef={composerRef}
			disabled={disabled}
			loading={isTurnBusy(turn)}
			onStop={canStopTurn(turn) ? stop : undefined}
			onSubmit={submit}
			placeholder={
				disabled
					? "Waiting for Claude Code…"
					: "Ask Claude Code to do something…"
			}
		/>
	)
})

type ChatScreenProps = {
	/** The bot this conversation belongs to. Its face is the one the replies wear —
	 * an uploaded picture is not among them: the transcript draws the animal. */
	bot: Bot
	chat: Chat
}

export function ChatScreen({ bot, chat }: ChatScreenProps) {
	const { state, controller } = chat
	const composerRef = useRef<HTMLTextAreaElement>(null)
	const [dismissedErrorId, setDismissedErrorId] = useState<string | null>(null)

	const disabled = !isSessionReady(state)
	const acceptsInput = !disabled && !isTurnBusy(state.turn)
	const emptyStateStatus = emptyStateStatusFor(state.connection)
	const latestError = state.errors.at(-1)
	const notice = latestError?.id === dismissedErrorId ? undefined : latestError
	const runs = toRuns(toTranscriptRows(state.messages))
	const working = workingStateFor(state)

	const restart = useCallback(() => {
		void controller.restart()
	}, [controller])

	const loadOlder = useCallback(() => {
		void controller.loadOlder()
	}, [controller])

	useEffect(() => {
		if (acceptsInput) {
			composerRef.current?.focus({ preventScroll: true })
		}
	}, [acceptsInput])

	return (
		<ChatLayout
			busy={isTurnBusy(state.turn)}
			label="Claude Code conversation"
			// Offered only once there is a transcript to sit above: an empty
			// conversation has no beginning to announce.
			older={
				state.messages.length > 0
					? {
							has: state.hasOlder,
							isLoading: state.loadingOlder,
							onLoad: loadOlder,
						}
					: undefined
			}
			header={
				<AppHeader
					insetWindowControls
					data-tauri-drag-region="deep"
					trailing={
						<ConnectionStatus
							state={state.connection}
							version={state.binaryVersion}
						/>
					}
				/>
			}
			notice={
				notice ? (
					<ChatNotice
						tone={needsFreshSession(notice.error) ? "error" : "warning"}
						title={noticeTitleFor(notice.error)}
						description={describeTransportError(notice.error)}
						retry={
							needsFreshSession(notice.error)
								? {
										label: "Restart session",
										onRetry: () => {
											setDismissedErrorId(notice.id)
											restart()
										},
									}
								: undefined
						}
						onDismiss={() => setDismissedErrorId(notice.id)}
					/>
				) : null
			}
			composer={
				<Composer
					controller={controller}
					composerRef={composerRef}
					disabled={disabled}
					turn={state.turn}
				/>
			}
		>
			{state.messages.length === 0 && emptyStateStatus ? (
				<ChatEmptyState
					className="m-auto"
					status={emptyStateStatus}
					onSetup={restart}
				/>
			) : null}

			{runs.map((run, runIndex) => {
				// Only the newest run may hold the mark, and only once the working
				// row below has given it up.
				const newest = runIndex === runs.length - 1
				const live = working !== null && newest
				const avatarIndex = live ? -1 : run.length - 1

				return (
					<ChatTurnGroup key={run[0].id} carriesMark={newest}>
						{run.map((row, index) => (
							<TranscriptTurn
								key={row.id}
								row={row}
								controller={controller}
								avatar={index === avatarIndex}
								animal={bot.avatarAnimal}
								pose={bot.avatarPose}
								rejected={row.messageId === state.rejectedPromptId}
							/>
						))}
					</ChatTurnGroup>
				)
			})}

			{state.activities.length > 0 ? (
				<ActivityLog
					activities={state.activities}
					turn={state.turn}
					workingKind={working?.kind}
				/>
			) : working ? (
				<BotWorking kind={working.kind} label={working.label} />
			) : null}

			{state.permission ? (
				<PermissionPrompt controller={controller} request={state.permission} />
			) : null}
		</ChatLayout>
	)
}
