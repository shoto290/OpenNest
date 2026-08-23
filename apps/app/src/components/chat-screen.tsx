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

/** The bot's face as the memoised rows below take it: four strings rather than a
 * node, so a streamed delta still shallow-compares equal. */
type BotFace = {
	animal: AvatarAnimal
	blot?: AvatarBlot
	/** The bot's id, which is what the shape of its blot is derived from. */
	seed: string
	image?: string
}

/** What a turn reads as under its bubble: the files the prompt named, then the
 * words themselves. The same on a stored row and on one still waiting to go. */
const TurnBody = ({ attachments, text }: MessageContent) => (
	<>
		<MessageAttachments items={attachments} onOpen={openAttachment} />
		{text ? <Markdown>{text}</Markdown> : null}
	</>
)

/** Memoised: a streamed delta rewrites one message, and the view model hands
 * back the same rows for the rest. `run` arrives from the enclosing group and
 * `avatar` stays a boolean, so the shallow compare holds through a stream — which
 * is also why the bot's face arrives spread rather than as an object. */
const TranscriptTurn = memo(function TranscriptTurn({
	row,
	controller,
	run,
	avatar,
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
	/** Claude refused this prompt. The stored row is whole either way — the reader
	 * wrote it and the store took it — so the retry lives on the screen alone. */
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

/** A prompt the reader has sent and nothing has taken yet. It reads like the
 * transcript row it is about to become — the same words, the same files named in
 * them — and carries the only way back out of the wait. */
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

/** A question the child asked, read as the card takes it: an option that describes
 * itself in no words describes itself in none, and one that previews nothing
 * previews nothing. */
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

/** Refusing to answer refuses the tool, which is the same denial any permission
 * gets and travels the same way. */
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

/** Memoised: the draft mirror must not re-render per token. Nothing here reads the
 * turn or the connection — the composer takes a prompt whatever either is doing,
 * and the outbox is where one that cannot land yet waits. */
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
	/** The bot the prompt is addressed to, which the placeholder names. */
	botName: string
	/** What the bot last answered to: the live session's own list once it has
	 * announced one, and until then the list the store kept from the session before
	 * it. Empty only for a bot no session has ever announced anything for. */
	commands: AgentCommand[]
	/** Whether files may be staged at all: they are written to disk against an open
	 * session, which a held prompt does not have. */
	canAttach: boolean
	/** Something is drawn over the conversation. */
	isOverlayOpen: boolean
	/** The files staged for this prompt, drawn as chips inside the composer. */
	attachments: StagedAttachment[]
	/** Files are being dragged over the conversation, which the composer wears even
	 * though the drag never reached it. */
	isDropTarget: boolean
	onAttach: (files: File[]) => void
	onRemoveAttachment: (id: string) => void
	/** Stores the staged files, then sends the prompt naming them. Answers whether
	 * it was taken: a refused store keeps the draft where the reader left it. */
	onSubmitPrompt: (text: string) => Promise<boolean>
}) {
	const t = useChatCopy()
	const [wasDismissed, setWasDismissed] = useState(false)
	const [prompt, setPrompt] = useState("")
	const options = useMemo(() => commandOptionsFor(commands), [commands])
	const query = isOverlayOpen ? null : commandQueryIn(prompt, commands)

	// A dismissal covers every draft that stays in the command shape, one edited
	// back to the shape it was dismissed on included. It rearms when the draft
	// leaves that shape, and while an overlay covers the conversation — so an
	// overlay closing offers the menu the draft under it asks for.
	const isDismissed = holdsDismissal(wasDismissed, query)
	if (wasDismissed !== isDismissed) {
		setWasDismissed(isDismissed)
	}

	// The draft only goes if it is still the one that was sent: storing the files
	// takes a round trip, and whatever the reader typed meanwhile is theirs.
	const submit = useCallback(
		async (value: string) => {
			const sent = await onSubmitPrompt(value)
			if (sent) {
				setPrompt((current) => (current.trim() === value ? "" : current))
			}
		},
		[onSubmitPrompt],
	)

	// Held stable: the menu listens for the keyboard and for a press outside while
	// it is open, and a fresh callback per keystroke would resubscribe both.
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

/** The one notice standing over the composer. A refused store takes the place of
 * the session's own while it stands: it is the newer fact, and the only one the
 * reader is still holding files for. */
function ConversationNotice({
	refusal,
	onDismissRefusal,
	error,
	onDismissError,
	onRestart,
}: {
	/** Why the staged files were not stored, while the reader still holds them. */
	refusal: AttachmentStoreError | null
	onDismissRefusal: () => void
	/** The newest transport error the reader has not dismissed. */
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
	/** The bot this conversation belongs to. Its face is the one the replies wear —
	 * an uploaded picture is not among them: the transcript draws the animal. */
	bot: Bot
	chat: Chat
	/** Whether the settings dialog stands open over this one. The gear says so, and
	 * pressing it is what closes the dialog again. */
	/** The files staged for every bot, so the ones this reader attached survive a
	 * switch to another bot and back. */
	attachments: AttachmentsController
	isSettingsOpen: boolean
	/** Whether anything at all is drawn over the conversation, this bot's settings
	 * included. What the composer reads: a menu of its own may not answer the
	 * keyboard from under a surface that has the reader's attention. */
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

	// The picture the bot wears, as something a webview may load. Resolved once per
	// render and handed down: every avatar on this screen is the same bot's.
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

	// The caret waits for nothing: a prompt written before the session is up is
	// held rather than refused, so the composer takes it the moment the screen is
	// there.
	useEffect(() => {
		composerRef.current?.focus({ preventScroll: true })
	}, [])

	return (
		<ChatLayout
			rootRef={conversationRef}
			busy={isTurnBusy(state.turn)}
			label={t("screen.label")}
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

			{/* Under everything the bot is doing: these are the words said after it,
			 * and the last of them is the newest thing on the screen. */}
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
