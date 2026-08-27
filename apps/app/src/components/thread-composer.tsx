import {
	memo,
	type RefObject,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react"

import type { ConversationBot } from "@workspace/ui/components/conversation-bots"
import { PromptAttachButton } from "@workspace/ui/components/prompt-attach-button"
import { PromptAttachments } from "@workspace/ui/components/prompt-attachments"
import { PromptCommandMenu } from "@workspace/ui/components/prompt-command-menu"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { PromptMentionMenu } from "@workspace/ui/components/prompt-mention-menu"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type { AgentCommand } from "@/lib/agent/contract"
import type { StagedAttachment } from "@/lib/chat/attachments"
import {
	commandOptionsFor,
	commandQueryIn,
	holdsDismissal,
	promptForCommand,
} from "@/lib/chat/prompt-commands"
import { mentionQueryIn, promptWithMention } from "@/lib/conversations/mentions"

type StagedFields = {
	attachments: StagedAttachment[]
	canAttach: boolean
	isDropTarget: boolean
	onAttach: (files: File[]) => void
	onRemoveAttachment: (id: string) => void
}

type BotComposerProps = StagedFields & {
	composerRef: RefObject<HTMLTextAreaElement | null>
	readDraft: () => string
	onPromptChange: (draft: string) => void
	botName: string
	commands: AgentCommand[]
	isOverlayOpen: boolean
	onSubmitPrompt: (text: string) => Promise<boolean>
}

export const BotComposer = memo(function BotComposer({
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
}: BotComposerProps) {
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
			onDismiss={dismiss}
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
				onValueChange={changePrompt}
				placeholder={t("screen.placeholder", { name: botName })}
				textareaRef={composerRef}
				value={prompt}
			/>
		</PromptCommandMenu>
	)
})

type ConversationComposerProps = StagedFields & {
	bots: ConversationBot[]
	leadId?: string
	composerRef: RefObject<HTMLTextAreaElement | null>
	readDraft: () => string
	onPromptChange: (draft: string) => void
	onSubmitPrompt: (text: string) => Promise<boolean>
}

export const ConversationComposer = ({
	bots,
	leadId,
	composerRef,
	canAttach,
	attachments,
	isDropTarget,
	onAttach,
	onRemoveAttachment,
	readDraft,
	onPromptChange,
	onSubmitPrompt,
}: ConversationComposerProps) => {
	const t = useChatCopy()
	const [prompt, setPrompt] = useState(readDraft)
	const [wasDismissed, setWasDismissed] = useState(false)

	const changePrompt = useCallback(
		(next: string) => {
			setPrompt(next)
			onPromptChange(next)
		},
		[onPromptChange],
	)

	const query = mentionQueryIn(prompt)
	const isDismissed = holdsDismissal(wasDismissed, query)
	if (wasDismissed !== isDismissed) {
		setWasDismissed(isDismissed)
	}

	const select = useCallback(
		(botId: string) => {
			const taken = bots.find((bot) => bot.id === botId)
			if (taken) {
				changePrompt(promptWithMention(prompt, taken.name))
			}
			composerRef.current?.focus({ preventScroll: true })
		},
		[bots, changePrompt, prompt, composerRef],
	)

	const submit = useCallback(
		async (value: string) => {
			if (await onSubmitPrompt(value)) {
				changePrompt("")
			}
		},
		[changePrompt, onSubmitPrompt],
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
				onValueChange={changePrompt}
				placeholder={t("composer.placeholder")}
				textareaRef={composerRef}
				value={prompt}
			/>
		</PromptMentionMenu>
	)
}
