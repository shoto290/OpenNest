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
import { PromptCommandMenu } from "@workspace/ui/components/prompt-command-menu"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import {
	ToolApproval,
	ToolApprovalCode,
} from "@workspace/ui/components/tool-approval"

import type { ChatController } from "@/lib/chat/chat-controller"
import { canStopTurn, isSessionReady, isTurnBusy } from "@/lib/chat/chat-state"
import { isTableBlock } from "@/lib/chat/markdown-blocks"
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
import type { Chat } from "@/lib/chat/use-chat"
import type { PermissionRequest, TurnState } from "@/lib/claude/contract"
import { describeTransportError } from "@/lib/claude/messages"
import type {
	AvatarAnimal,
	AvatarBlot,
	Bot,
} from "@/lib/conversations/store-contract"
import { avatarSrc } from "@/lib/host"

/** The bot's face as the memoised rows below take it: four strings rather than a
 * node, so a streamed delta still shallow-compares equal. */
type BotFace = {
	animal: AvatarAnimal
	blot?: AvatarBlot
	/** The bot's id, which is what the shape of its blot is derived from. */
	seed: string
	image?: string
}

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
	const content = <Markdown>{row.text}</Markdown>

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
				{content}
			</UserTurn>
		)
	}

	return (
		<AssistantTurn
			state={row.completion}
			run={run}
			copyText={row.text}
			bare={isTableBlock(row.text)}
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
	commands,
	disabled,
	isOverlayOpen,
	turn,
}: {
	controller: ChatController
	composerRef: RefObject<HTMLTextAreaElement | null>
	/** What the live session answers to. Empty until it says so, and empty again
	 * once it is gone. */
	commands: string[]
	disabled: boolean
	/** Something is drawn over the conversation. */
	isOverlayOpen: boolean
	turn: TurnState
}) {
	const [wasDismissed, setWasDismissed] = useState(false)
	const [prompt, setPrompt] = useState("")
	const options = useMemo(() => commandOptionsFor(commands), [commands])
	const canType = !disabled && !isOverlayOpen
	const query = canType ? commandQueryIn(prompt, commands) : null

	// A dismissal covers every draft that stays in the command shape, one edited
	// back to the shape it was dismissed on included. It rearms when the draft
	// leaves that shape, and while nothing can be typed at all — so an overlay
	// closing offers the menu the draft under it asks for.
	const isDismissed = holdsDismissal(wasDismissed, query)
	if (wasDismissed !== isDismissed) {
		setWasDismissed(isDismissed)
	}

	const stop = useCallback(() => {
		void controller.stop()
	}, [controller])

	const submit = useCallback(
		(value: string) => {
			setPrompt("")
			void controller.send(value)
		},
		[controller],
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
				disabled={disabled}
				loading={isTurnBusy(turn)}
				onStop={canStopTurn(turn) ? stop : undefined}
				onSubmit={submit}
				onValueChange={setPrompt}
				value={prompt}
				placeholder={
					disabled
						? "Waiting for Claude Code…"
						: "Ask Claude Code to do something…"
				}
			/>
		</PromptCommandMenu>
	)
})

/** The bot's settings are not a page of their own, so the way into them is the one
 * control in the bar above the conversation they belong to. */
const SETTINGS_LABEL = "Bot settings"

type ChatScreenProps = {
	/** The bot this conversation belongs to. Its face is the one the replies wear —
	 * an uploaded picture is not among them: the transcript draws the animal. */
	bot: Bot
	chat: Chat
	/** Whether the settings dialog stands open over this one. The gear says so, and
	 * pressing it is what closes the dialog again. */
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
	isSettingsOpen,
	isOverlayOpen,
	onToggleSettings,
}: ChatScreenProps) {
	const { state, controller } = chat
	const composerRef = useRef<HTMLTextAreaElement>(null)
	const [dismissedErrorId, setDismissedErrorId] = useState<string | null>(null)

	// The picture the bot wears, as something a webview may load. Resolved once per
	// render and handed down: every avatar on this screen is the same bot's.
	const face = avatarSrc(bot.avatarImagePath)
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
						<>
							<ConnectionStatus
								state={state.connection}
								version={state.binaryVersion}
							/>
							<Button
								aria-expanded={isSettingsOpen}
								aria-label={SETTINGS_LABEL}
								onClick={onToggleSettings}
								size="icon-sm"
								tooltip={SETTINGS_LABEL}
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
					commands={state.commands}
					disabled={disabled}
					isOverlayOpen={isOverlayOpen}
					turn={state.turn}
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
				/>
			) : null}

			{state.permission ? (
				<PermissionPrompt controller={controller} request={state.permission} />
			) : null}
		</ChatLayout>
	)
}
