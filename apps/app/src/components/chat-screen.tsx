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
import { Button } from "@workspace/ui/components/button"
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
import { Icons } from "@workspace/ui/components/icons"
import { Markdown } from "@workspace/ui/components/markdown"
import { MessageAttachments } from "@workspace/ui/components/message-attachments"
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
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

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
import type { AttachmentStoreError } from "@/lib/chat/attachments-contract"
import type { AttachmentsController } from "@/lib/chat/attachments-controller"
import type { ChatController } from "@/lib/chat/chat-controller"
import type { ChatError, OutboxEntry } from "@/lib/chat/chat-state"
import { canStopTurn, isSessionReady, isTurnBusy } from "@/lib/chat/chat-state"
import { isTableBlock } from "@/lib/chat/markdown-blocks"
import type { MessageContent } from "@/lib/chat/message-attachments"
import { messageWithAttachments } from "@/lib/chat/message-attachments"
import {
	commandOptionsFor,
	commandQueryIn,
	holdsDismissal,
	promptForCommand,
} from "@/lib/chat/prompt-commands"
import {
	emptyStateStatusFor,
	needsFreshSession,
	noticeTitleFor,
	type TranscriptRow,
	toRuns,
	toTranscriptRows,
	workingStateFor,
} from "@/lib/chat/screen-model"
import { useAttachments } from "@/lib/chat/use-attachments"
import type { Chat } from "@/lib/chat/use-chat"
import type {
	AvatarAnimal,
	AvatarBlot,
	Bot,
} from "@/lib/conversations/store-contract"
import { avatarSrc } from "@/lib/host"
import { openAttachment } from "@/lib/links/open-attachment"

type BotFace = {
	name: string
	animal: AvatarAnimal
	blot?: AvatarBlot
	seed: string
	image?: string
}

const TurnBody = ({ attachments, text }: MessageContent) => (
	<>
		<MessageAttachments items={attachments} onOpen={openAttachment} />
		{text ? <Markdown>{text}</Markdown> : null}
	</>
)

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
}: BotFace & {
	row: TranscriptRow
	controller: ChatController
	run?: ChatTurnRun
	avatar: boolean
	rejected?: boolean
}) {
	const { text, attachments } = messageWithAttachments(row.text)
	const content = <TurnBody attachments={attachments} text={text} />

	if (row.role === "user") {
		return (
			<UserTurn
				state={rejected ? "failed" : row.completion}
				run={run}
				copyText={text}
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
			state={row.completion}
			run={run}
			copyText={text}
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
	const [prompt, setPrompt] = useState("")
	const options = useMemo(() => commandOptionsFor(commands), [commands])
	const query = isOverlayOpen ? null : commandQueryIn(prompt, commands)

	const isDismissed = holdsDismissal(wasDismissed, query)
	if (wasDismissed !== isDismissed) {
		setWasDismissed(isDismissed)
	}

	const submit = useCallback(
		async (value: string) => {
			const sent = await onSubmitPrompt(value)
			if (sent) {
				setPrompt((current) => (current.trim() === value ? "" : current))
			}
		},
		[onSubmitPrompt],
	)

	const select = useCallback(
		(option: string) => {
			setPrompt(promptForCommand(option))
			composerRef.current?.focus({ preventScroll: true })
		},
		[composerRef],
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
				onValueChange={setPrompt}
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

type ChatScreenProps = {
	bot: Bot
	chat: Chat
	attachments: AttachmentsController
	isSettingsOpen: boolean
	isOverlayOpen: boolean
	onToggleSettings: () => void
}

export function ChatScreen({
	bot,
	chat,
	attachments,
	isSettingsOpen,
	isOverlayOpen,
	onToggleSettings,
}: ChatScreenProps) {
	const t = useChatCopy()
	const { state, controller } = chat
	const composerRef = useRef<HTMLTextAreaElement>(null)
	const conversationRef = useRef<HTMLDivElement>(null)
	const [dismissedErrorId, setDismissedErrorId] = useState<string | null>(null)

	const face = avatarSrc(bot.avatarImagePath)
	const canAttach = isSessionReady(state)
	const staged = useAttachments(attachments, bot.id, canAttach, conversationRef)
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

	const stop = useCallback(() => {
		void controller.stop()
	}, [controller])

	useEffect(() => {
		composerRef.current?.focus({ preventScroll: true })
	}, [])

	return (
		<ChatLayout
			rootRef={conversationRef}
			busy={isTurnBusy(state.turn)}
			label={t("screen.label")}
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
						<>
							<ConnectionStatus
								state={state.connection}
								version={state.binaryVersion}
							/>
							<Button
								aria-expanded={isSettingsOpen}
								aria-label={t("screen.settings")}
								onClick={onToggleSettings}
								size="icon-sm"
								tooltip={t("screen.settings")}
								tooltipSide="bottom"
								variant="ghost"
							>
								<Icons.Settings aria-hidden="true" />
							</Button>
						</>
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
			composer={
				<Composer
					composerRef={composerRef}
					botName={bot.name}
					commands={state.commands}
					canAttach={canAttach}
					isOverlayOpen={isOverlayOpen}
					attachments={staged.items}
					isDropTarget={staged.isDropTarget}
					onAttach={staged.stage}
					onRemoveAttachment={staged.remove}
					onSubmitPrompt={staged.submit}
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
					<ChatTurnGroup key={run[0].id} carriesMark={newest}>
						{run.map((row, index) => (
							<TranscriptTurn
								key={row.id}
								row={row}
								controller={controller}
								avatar={index === avatarIndex}
								name={bot.name}
								animal={bot.avatarAnimal}
								blot={bot.avatarBlot ?? undefined}
								seed={bot.id}
								image={face}
								rejected={row.messageId === state.rejectedPromptId}
							/>
						))}
					</ChatTurnGroup>
				)
			})}

			{working ? (
				<BotWorking
					animal={bot.avatarAnimal}
					blot={bot.avatarBlot ?? undefined}
					image={face}
					name={bot.name}
					kind={working.kind}
					label={working.label}
					seed={bot.id}
					onStop={canStopTurn(state.turn) ? stop : undefined}
				/>
			) : null}

			{state.question ? (
				<QuestionPrompt controller={controller} request={state.question} />
			) : null}

			{state.permission ? (
				<PermissionPrompt controller={controller} request={state.permission} />
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
