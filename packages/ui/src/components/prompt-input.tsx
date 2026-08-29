"use client"

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

const LINE_HEIGHT = 24
const PADDING_Y = 8
const MIRROR =
	"pointer-events-none invisible absolute top-0 left-0 px-2 text-sm leading-6"

const FILES = "Files"

const rowsIn = (element: HTMLElement) =>
	Math.round(element.scrollHeight / LINE_HEIGHT)

const pixelsIn = (value: string) => Number.parseFloat(value) || 0

const roomBesideControls = (
	form: HTMLElement,
	...controls: (HTMLElement | null)[]
) => {
	const style = getComputedStyle(form)
	const gap = pixelsIn(style.columnGap)
	return controls.reduce(
		(room, control) =>
			control && control.offsetWidth > 0
				? room - control.offsetWidth - gap
				: room,
		form.clientWidth -
			pixelsIn(style.paddingInlineStart) -
			pixelsIn(style.paddingInlineEnd),
	)
}

const filesIn = (transfer: DataTransfer) => Array.from(transfer.files)

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
	onSubmit?: (value: string) => void
	leading?: ReactNode
	trailing?: ReactNode
	attachments?: ReactNode
	onAttach?: (files: File[]) => void
	dropTarget?: boolean
	minRows?: number
	maxRows?: number
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
	const formRef = useRef<HTMLFormElement>(null)
	const measurementRef = useRef<HTMLDivElement>(null)
	const singleLineRef = useRef<HTMLDivElement>(null)
	const promptRef = useRef<HTMLDivElement>(null)
	const attachmentsRef = useRef<HTMLDivElement>(null)
	const leadingRef = useRef<HTMLDivElement>(null)
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
		const form = formRef.current
		const measurement = measurementRef.current
		const singleLine = singleLineRef.current
		const prompt = promptRef.current
		const controls = controlsRef.current
		const isReady =
			textarea && form && measurement && singleLine && prompt && controls
		if (!isReady || textarea.value !== currentValue) return

		const isCarryingFiles =
			Boolean(attachments) &&
			(attachmentsRef.current?.childElementCount ?? 0) > 0
		setHasAttachments(isCarryingFiles)

		const promptWidth = Math.ceil(singleLine.getBoundingClientRect().width)
		const isFillingRow =
			isCarryingFiles ||
			rowsIn(singleLine) > 1 ||
			promptWidth > roomBesideControls(form, leadingRef.current, controls)

		prompt.style.flexBasis = isFillingRow ? "100%" : `${promptWidth}px`
		measurement.style.width = `${textarea.clientWidth}px`

		const rows = Math.min(Math.max(rowsIn(measurement), minRows), maxRows)
		textarea.style.height = `${rows * LINE_HEIGHT + PADDING_Y}px`

		setIsExpanded(isFillingRow)
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
			ref={formRef}
			onSubmit={submit}
			data-slot="prompt-input"
			data-expanded={isExpanded}
			data-drop-target={isDropTarget}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDragEnd={() => setIsDragOver(false)}
			onDrop={handleDrop}
			className={cn(
				"flex w-full flex-wrap items-center gap-1 rounded-4xl border border-border bg-background p-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
				isDropTarget && "border-primary bg-primary/10",
				disabled && "opacity-50",
				className,
			)}
		>
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

			<div
				ref={leadingRef}
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
				className="ms-auto flex items-center justify-end gap-1"
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
