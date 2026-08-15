"use client"
// Adapted from beui.dev/components/agents/prompt-input — write, send, stop.

import {
	type FormEvent,
	type KeyboardEvent,
	type Ref,
	type TextareaHTMLAttributes,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { ActionSwapIcon } from "@workspace/ui/components/motion/action-swap"
import { cn, mergeRefs } from "@workspace/ui/lib/utils"

/** Matches `leading-6` on the textarea and its measurement mirror. */
const LINE_HEIGHT = 24
/** Matches `py-1.5` on the textarea. */
const PADDING_Y = 12

export interface PromptInputProps
	extends Omit<
		TextareaHTMLAttributes<HTMLTextAreaElement>,
		"value" | "defaultValue" | "onChange" | "onSubmit" | "children"
	> {
	value?: string
	defaultValue?: string
	onValueChange?: (value: string) => void
	/** Receives the trimmed prompt. Fired by Enter or by the send button. */
	onSubmit?: (value: string) => void
	/** Swaps the send button for a stop button and blocks submission. */
	loading?: boolean
	/** Omit while loading to render the stop button inert — a stop already requested. */
	onStop?: () => void
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
	loading = false,
	onStop,
	minRows = 2,
	maxRows = 8,
	className,
	disabled,
	placeholder = "Ask the agent to do something…",
	"aria-label": ariaLabel = "Prompt",
	onKeyDown,
	textareaRef: externalTextareaRef,
	...textareaProps
}: PromptInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const measurementRef = useRef<HTMLDivElement>(null)
	const setTextareaRef = useMemo(
		() => mergeRefs(textareaRef, externalTextareaRef),
		[externalTextareaRef],
	)
	const [internalValue, setInternalValue] = useState(defaultValue)
	const currentValue = value ?? internalValue
	const canSubmit = Boolean(currentValue.trim()) && !disabled && !loading

	const resizeTextarea = useCallback(() => {
		const textarea = textareaRef.current
		const measurement = measurementRef.current
		if (!textarea || !measurement || textarea.value !== currentValue) return

		const rows = Math.min(
			Math.max(Math.round(measurement.scrollHeight / LINE_HEIGHT), minRows),
			maxRows,
		)
		textarea.style.height = `${rows * LINE_HEIGHT + PADDING_Y}px`
	}, [currentValue, maxRows, minRows])

	useLayoutEffect(resizeTextarea, [resizeTextarea])

	useEffect(() => {
		const measurement = measurementRef.current
		if (!measurement || typeof ResizeObserver === "undefined") return
		const observer = new ResizeObserver(resizeTextarea)
		observer.observe(measurement)
		return () => observer.disconnect()
	}, [resizeTextarea])

	const setValue = (next: string) => {
		if (value === undefined) setInternalValue(next)
		onValueChange?.(next)
	}

	const submit = (event?: FormEvent) => {
		event?.preventDefault()
		const prompt = currentValue.trim()
		if (!prompt || disabled || loading) return

		onSubmit?.(prompt)
		if (value === undefined) setInternalValue("")
		textareaRef.current?.focus({ preventScroll: true })
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
			aria-busy={loading}
			className={cn(
				"relative w-full rounded-2xl border border-border bg-background p-2 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
				disabled && "opacity-50",
				className,
			)}
		>
			<div
				ref={measurementRef}
				aria-hidden="true"
				className="pointer-events-none invisible absolute inset-x-2 top-0 px-2 text-sm leading-6 whitespace-pre-wrap [overflow-wrap:break-word]"
			>
				{`${currentValue}\u200b`}
			</div>
			<textarea
				ref={setTextareaRef}
				value={currentValue}
				disabled={disabled}
				placeholder={placeholder}
				aria-label={ariaLabel}
				rows={minRows}
				{...textareaProps}
				onChange={(event) => setValue(event.target.value)}
				onKeyDown={handleKeyDown}
				className="block w-full resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
			/>

			<div className="mt-1 flex min-h-8 items-center justify-end">
				<Button
					type={loading ? "button" : "submit"}
					size="icon"
					disabled={loading ? !onStop : !canSubmit}
					aria-label={loading ? "Stop generating" : "Send prompt"}
					onClick={loading ? onStop : undefined}
					className="rounded-full"
				>
					<ActionSwapIcon
						value={loading ? "stop" : "send"}
						animation="roll"
						className="size-4"
					>
						{loading ? <Icons.Stop /> : <Icons.Send />}
					</ActionSwapIcon>
				</Button>
			</div>
		</form>
	)
}
