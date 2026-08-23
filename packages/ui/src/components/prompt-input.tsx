"use client"
// Adapted from beui.dev/components/agents/prompt-input — write and send.

import {
	type ClipboardEvent,
	type DragEvent,
	type FormEvent,
	type KeyboardEvent,
	type ReactNode,
	type Ref,
	type TextareaHTMLAttributes,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { cn, mergeRefs } from "@workspace/ui/lib/utils"

/** Matches `leading-6` on the textarea and its measurement mirrors. */
const LINE_HEIGHT = 24
/** Matches `py-1` on the textarea, which makes one row exactly as tall as the send
 * button beside it — any taller and the row centres the button, pushing it off the
 * even inset the composer's padding gives it. */
const PADDING_Y = 8
/** Typography the mirrors share with the textarea, so both measure what it renders. */
const MIRROR =
	"pointer-events-none invisible absolute top-0 left-0 px-2 text-sm leading-6"

const FILES = "Files"

const rowsIn = (element: HTMLElement) =>
	Math.round(element.scrollHeight / LINE_HEIGHT)

const filesIn = (transfer: DataTransfer) => Array.from(transfer.files)

/** The files of a payload made of files and nothing else. One that also carries
 * text is the browser's business: it is a paste into the prompt, not an
 * attachment. */
const pastedFiles = (transfer: DataTransfer) =>
	transfer.types.every((type) => type === FILES) ? filesIn(transfer) : []

export interface PromptInputProps
	extends Omit<
		TextareaHTMLAttributes<HTMLTextAreaElement>,
		"value" | "defaultValue" | "onChange" | "onSubmit" | "children"
	> {
	value?: string
	defaultValue?: string
	onValueChange?: (value: string) => void
	/** Receives the trimmed prompt, empty when the turn is carried by its
	 * attachments alone. Fired by Enter or by the send button. A prompt written
	 * while a turn is running is sent like any other: the transcript is where a
	 * prompt that cannot land yet waits, not the composer. */
	onSubmit?: (value: string) => void
	/** Controls held on the leading edge of the composer: before the prompt while it
	 * fits on one line, opening the control row once it wraps. */
	leading?: ReactNode
	/** Controls held right before the send button, on the trailing edge. */
	trailing?: ReactNode
	/** The files staged for this prompt, rendered above the textarea and inside the
	 * composer. A slot holding nothing takes no room and leaves the pill untouched;
	 * one holding a chip expands the composer. */
	attachments?: ReactNode
	/** Receives the files dropped on the composer or pasted into the textarea. Left
	 * out, the composer lets the browser handle both. */
	onAttach?: (files: File[]) => void
	/** Marks the composer as the target of a drag it never saw, for a host tracking
	 * one over a wider surface. Its own drag events keep marking it on their own, and
	 * a composer that cannot take a file stays unmarked whatever the host asks. */
	dropTarget?: boolean
	minRows?: number
	maxRows?: number
	/** Exposes the textarea so a host can restore focus after its own interactions. */
	textareaRef?: Ref<HTMLTextAreaElement>
}

export function PromptInput({
	value,
	defaultValue = "",
	onValueChange,
	onSubmit,
	leading,
	trailing,
	attachments,
	onAttach,
	dropTarget = false,
	minRows = 1,
	maxRows = 8,
	className,
	disabled,
	placeholder,
	"aria-label": ariaLabel,
	onKeyDown,
	onPaste,
	textareaRef: externalTextareaRef,
	...textareaProps
}: PromptInputProps) {
	const { t } = useTranslation("chat")
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const measurementRef = useRef<HTMLDivElement>(null)
	const singleLineRef = useRef<HTMLDivElement>(null)
	const promptRef = useRef<HTMLDivElement>(null)
	const attachmentsRef = useRef<HTMLDivElement>(null)
	const controlsRef = useRef<HTMLDivElement>(null)
	const setTextareaRef = useMemo(
		() => mergeRefs(textareaRef, externalTextareaRef),
		[externalTextareaRef],
	)
	const latestResize = useRef(() => {})
	const [internalValue, setInternalValue] = useState(defaultValue)
	const [isExpanded, setIsExpanded] = useState(false)
	const [isDragOver, setIsDragOver] = useState(false)
	const [hasAttachments, setHasAttachments] = useState(false)
	const currentValue = value ?? internalValue
	const hasPrompt = Boolean(currentValue.trim())
	const hasPayload = hasPrompt || hasAttachments
	const canAttach = Boolean(onAttach) && !disabled
	const isDropTarget = canAttach && (dropTarget || isDragOver)
	const canSubmit = hasPayload && !disabled

	const resizeTextarea = useCallback(() => {
		const textarea = textareaRef.current
		const measurement = measurementRef.current
		const singleLine = singleLineRef.current
		const prompt = promptRef.current
		const controls = controlsRef.current
		if (!textarea || !measurement || !singleLine || !prompt || !controls) return
		if (textarea.value !== currentValue) return

		// A slot given a node that renders nothing still leaves the row empty, so the
		// answer comes from the DOM the last commit produced.
		const isCarryingFiles =
			Boolean(attachments) &&
			(attachmentsRef.current?.childElementCount ?? 0) > 0
		setHasAttachments(isCarryingFiles)

		prompt.style.flexBasis =
			isCarryingFiles || rowsIn(singleLine) > 1
				? "100%"
				: `${Math.ceil(singleLine.getBoundingClientRect().width)}px`
		measurement.style.width = `${textarea.clientWidth}px`

		const rows = Math.min(Math.max(rowsIn(measurement), minRows), maxRows)
		textarea.style.height = `${rows * LINE_HEIGHT + PADDING_Y}px`

		setIsExpanded(controls.offsetTop >= prompt.offsetTop + prompt.offsetHeight)
	}, [attachments, currentValue, maxRows, minRows])

	useLayoutEffect(() => {
		latestResize.current = resizeTextarea
		resizeTextarea()
	}, [resizeTextarea])

	useEffect(() => {
		const prompt = promptRef.current
		if (!prompt || typeof ResizeObserver === "undefined") return
		const observer = new ResizeObserver(() => latestResize.current())
		observer.observe(prompt)
		return () => observer.disconnect()
	}, [])

	const setValue = (next: string) => {
		if (value === undefined) setInternalValue(next)
		onValueChange?.(next)
	}

	const submit = (event?: FormEvent) => {
		event?.preventDefault()
		if (!canSubmit) return

		onSubmit?.(currentValue.trim())
		if (value === undefined) setInternalValue("")
		textareaRef.current?.focus({ preventScroll: true })
	}

	const handleDragOver = (event: DragEvent<HTMLFormElement>) => {
		if (!canAttach || !event.dataTransfer.types.includes(FILES)) return
		event.preventDefault()
		setIsDragOver(true)
	}

	/** A drag entering a child leaves the form on its way in: only a target outside
	 * the composer ends what its own events started — a host still asking for the
	 * mark keeps it. */
	const handleDragLeave = (event: DragEvent<HTMLFormElement>) => {
		if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
		setIsDragOver(false)
	}

	const handleDrop = (event: DragEvent<HTMLFormElement>) => {
		setIsDragOver(false)
		const files = filesIn(event.dataTransfer)
		if (!canAttach || files.length === 0) return
		event.preventDefault()
		onAttach?.(files)
	}

	const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
		onPaste?.(event)
		if (!canAttach || event.defaultPrevented) return
		const files = pastedFiles(event.clipboardData)
		if (files.length === 0) return
		event.preventDefault()
		onAttach?.(files)
	}

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		onKeyDown?.(event)
		if (
			event.defaultPrevented ||
			event.key !== "Enter" ||
			event.shiftKey ||
			event.nativeEvent.isComposing
		) {
			return
		}
		event.preventDefault()
		submit()
	}

	return (
		<form
			onSubmit={submit}
			data-slot="prompt-input"
			data-expanded={isExpanded}
			data-drop-target={isDropTarget}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDragEnd={() => setIsDragOver(false)}
			onDrop={handleDrop}
			className={cn(
				"flex w-full flex-wrap items-center gap-1 border border-border bg-background p-2 transition-[border-radius] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 motion-reduce:transition-none",
				isExpanded ? "rounded-3xl" : "rounded-full",
				isDropTarget && "border-primary bg-primary/10",
				disabled && "opacity-50",
				className,
			)}
		>
			{/* Always mounted so the slot can be measured: a chip in it turns the pill
			into the expanded composer, and an empty row takes no room at all. */}
			<div
				ref={attachmentsRef}
				inert={disabled}
				className="w-full empty:hidden"
			>
				{attachments}
			</div>

			<div
				ref={promptRef}
				className="relative min-w-0 grow-[999] overflow-hidden"
			>
				<div
					ref={singleLineRef}
					aria-hidden="true"
					className={cn(MIRROR, "w-max whitespace-pre")}
				>
					{`${currentValue}\u200b`}
				</div>
				<div
					ref={measurementRef}
					aria-hidden="true"
					className={cn(
						MIRROR,
						"whitespace-pre-wrap [overflow-wrap:break-word]",
					)}
				>
					{`${currentValue}\u200b`}
				</div>
				<textarea
					ref={setTextareaRef}
					value={currentValue}
					disabled={disabled}
					placeholder={placeholder ?? t("composer.placeholder")}
					aria-label={ariaLabel ?? t("composer.label")}
					rows={minRows}
					{...textareaProps}
					onChange={(event) => setValue(event.target.value)}
					onKeyDown={handleKeyDown}
					onPaste={handlePaste}
					className="block w-full resize-none overflow-y-auto bg-transparent px-2 py-1 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
				/>
			</div>

			{/* Ordered before the prompt while they share a row, so the slot reads on the
			leading edge of the pill instead of beside the send button. */}
			<div
				inert={disabled}
				className={cn(
					"flex items-center gap-1 empty:hidden",
					!isExpanded && "order-first",
				)}
			>
				{leading}
			</div>

			<div
				ref={controlsRef}
				inert={disabled}
				className="flex grow items-center justify-end gap-1"
			>
				{trailing}
				{hasPayload ? (
					<Button
						type="submit"
						size="icon"
						disabled={!canSubmit}
						aria-label={t("composer.send")}
						className="rounded-full"
					>
						<Icons.Send />
					</Button>
				) : null}
			</div>
		</form>
	)
}
