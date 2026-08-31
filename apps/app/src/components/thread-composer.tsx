import {
	type ReactNode,
	type RefObject,
	useCallback,
	useRef,
	useState,
} from "react"

import { PromptAttachButton } from "@workspace/ui/components/prompt-attach-button"
import { PromptAttachments } from "@workspace/ui/components/prompt-attachments"
import { PromptInput } from "@workspace/ui/components/prompt-input"

import type { StagedAttachment } from "@/lib/chat/attachments"
import { holdsDismissal } from "@/lib/chat/prompt-commands"

export type ThreadMenuSlot = {
	prompt: string
	query: string
	isOpen: boolean
	onDismiss: () => void
	onPick: (text: string) => void
	children: ReactNode
}

export type ThreadComposerProps = {
	attachments: StagedAttachment[]
	canAttach: boolean
	isDropTarget: boolean
	onAttach: (files: File[]) => void
	onRemoveAttachment: (id: string) => void
	composerRef: RefObject<HTMLTextAreaElement | null>
	readDraft: () => string
	onPromptChange: (draft: string) => void
	onSubmitPrompt: (text: string) => Promise<boolean>
	placeholder: string
	queryIn: (prompt: string) => string | null
	menu: (slot: ThreadMenuSlot) => ReactNode
}

export const ThreadComposer = ({
	attachments,
	canAttach,
	isDropTarget,
	onAttach,
	onRemoveAttachment,
	composerRef,
	readDraft,
	onPromptChange,
	onSubmitPrompt,
	placeholder,
	queryIn,
	menu,
}: ThreadComposerProps) => {
	const [prompt, setPrompt] = useState(readDraft)
	const [wasDismissed, setWasDismissed] = useState(false)
	const latestPrompt = useRef(prompt)

	const query = queryIn(prompt)
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

	const pick = useCallback(
		(text: string) => {
			changePrompt(text)
			composerRef.current?.focus({ preventScroll: true })
		},
		[changePrompt, composerRef],
	)

	return menu({
		prompt,
		query: query ?? "",
		isOpen: query !== null && !isDismissed,
		onDismiss: () => setWasDismissed(true),
		onPick: pick,
		children: (
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
				placeholder={placeholder}
				textareaRef={composerRef}
				value={prompt}
			/>
		),
	})
}
