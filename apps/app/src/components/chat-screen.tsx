import { memo, type Ref, useCallback, useEffect, useRef, useState } from "react"

import { AgentActivity } from "@workspace/ui/components/agent-activity"
import { AppHeader } from "@workspace/ui/components/app-header"
import { ChatEmptyState } from "@workspace/ui/components/chat-empty-state"
import { ChatLayout } from "@workspace/ui/components/chat-layout"
import { ChatNotice } from "@workspace/ui/components/chat-notice"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/chat-turn"
import { ConnectionStatus } from "@workspace/ui/components/connection-status"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import {
	ToolApproval,
	ToolApprovalCode,
} from "@workspace/ui/components/tool-approval"

import type { ChatController } from "@/lib/chat/chat-controller"
import { canStopTurn, isSessionReady, isTurnBusy } from "@/lib/chat/chat-state"
import type { ChatDriver } from "@/lib/chat/driver"
import {
	activityStatusFor,
	emptyStateStatusFor,
	needsFreshSession,
	noticeTitleFor,
	toActivityItems,
} from "@/lib/chat/screen-model"
import { useChat } from "@/lib/chat/use-chat"
import type {
	ActivityEvent,
	ChatMessage,
	PermissionRequest,
	TurnState,
} from "@/lib/claude/contract"
import { describeTransportError } from "@/lib/claude/messages"

/** Memoised: a streamed delta rewrites one message, never the rest of the transcript. */
const TranscriptTurn = memo(function TranscriptTurn({
	message,
	controller,
}: {
	message: ChatMessage
	controller: ChatController
}) {
	if (message.role === "user") {
		return (
			<UserTurn
				state={message.completion}
				onRetry={() => {
					void controller.retry(message.id)
				}}
			>
				{message.text}
			</UserTurn>
		)
	}

	return (
		<AssistantTurn state={message.completion} copyText={message.text}>
			{message.text}
		</AssistantTurn>
	)
})

/** Memoised: the layout-animated rows re-measure on commit, and a text delta
 * leaves `activities` untouched. */
const ActivityLog = memo(function ActivityLog({
	activities,
	turn,
}: {
	activities: ActivityEvent[]
	turn: TurnState
}) {
	const items = toActivityItems(activities)

	return (
		<AgentActivity
			items={items}
			status={activityStatusFor(turn)}
			activeLabel="Working…"
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

export function ChatScreen({ driver }: { driver: ChatDriver }) {
	const { state, controller } = useChat(driver)
	const composerRef = useRef<HTMLTextAreaElement>(null)
	const [dismissedErrorId, setDismissedErrorId] = useState<string | null>(null)

	const disabled = !isSessionReady(state)
	const acceptsInput = !disabled && !isTurnBusy(state.turn)
	const emptyStateStatus = emptyStateStatusFor(state.connection)
	const latestError = state.errors.at(-1)
	const notice = latestError?.id === dismissedErrorId ? undefined : latestError

	const preflight = useCallback(() => {
		void controller.preflight()
	}, [controller])

	useEffect(() => {
		preflight()
	}, [preflight])

	useEffect(() => {
		if (acceptsInput) {
			composerRef.current?.focus({ preventScroll: true })
		}
	}, [acceptsInput])

	return (
		<ChatLayout
			busy={isTurnBusy(state.turn)}
			label="Claude Code conversation"
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
											preflight()
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
					onSetup={preflight}
				/>
			) : null}

			{state.messages.map((message) => (
				<TranscriptTurn
					key={message.id}
					message={message}
					controller={controller}
				/>
			))}

			{state.activities.length > 0 ? (
				<ActivityLog activities={state.activities} turn={state.turn} />
			) : null}

			{state.permission ? (
				<PermissionPrompt controller={controller} request={state.permission} />
			) : null}
		</ChatLayout>
	)
}
