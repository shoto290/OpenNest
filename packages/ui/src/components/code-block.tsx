"use client"
// Adapted from beui.dev/components/agents/code-block

import {
	type CSSProperties,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import {
	type CodeToken,
	highlightCode,
	resolveCodeLanguage,
} from "@workspace/ui/lib/code-highlight"
import { cn } from "@workspace/ui/lib/utils"

export type CodeBlockStatus = "streaming" | "complete"

type CopyOutcome = "idle" | "copied" | "failed"

export interface CodeBlockProps {
	code: string
	/** Free-form so a model can stream any fence label; unknown values render as plain text. */
	language?: string
	filename?: string
	status?: CodeBlockStatus
	showLineNumbers?: boolean
	highlightLines?: number[]
	maxHeight?: number
	wrap?: boolean
	copyable?: boolean
	onCopy?: () => void | Promise<void>
	className?: string
}

export interface CodeLineProps {
	content: string
	tokens?: CodeToken[]
	className?: string
}

const COPY_FEEDBACK_MS = 2000

const COPY_ANNOUNCEMENTS: Record<CopyOutcome, string> = {
	idle: "",
	copied: "Code copied to clipboard",
	failed: "Copying the code failed",
}

export function CodeLine({ content, tokens, className }: CodeLineProps) {
	if (!tokens) return <span className={className}>{content}</span>

	return (
		<span className={className}>
			{tokens.map((token) => (
				<span
					key={token.offset}
					style={
						{
							"--code-token-light": token.light ?? "currentColor",
							"--code-token-dark": token.dark ?? token.light ?? "currentColor",
						} as CSSProperties
					}
					className="text-[var(--code-token-light)] dark:text-[var(--code-token-dark)]"
				>
					{token.content}
				</span>
			))}
		</span>
	)
}

export function CodeBlock({
	code,
	language,
	filename,
	status = "complete",
	showLineNumbers = true,
	highlightLines = [],
	maxHeight = 280,
	wrap = false,
	copyable = true,
	onCopy,
	className,
}: CodeBlockProps) {
	const viewportRef = useRef<HTMLDivElement>(null)
	const [copyOutcome, setCopyOutcome] = useState<CopyOutcome>("idle")
	const streaming = status === "streaming"
	const label = language?.trim() || resolveCodeLanguage(language)

	const lines = useMemo(() => {
		const tokenLines = highlightCode(code, language)
		let offset = 0
		return code.split("\n").map((content, index) => {
			const line = { content, offset, tokens: tokenLines[index] }
			offset += content.length + 1
			return line
		})
	}, [code, language])

	const highlighted = useMemo(() => new Set(highlightLines), [highlightLines])

	useEffect(() => {
		const viewport = viewportRef.current
		if (!viewport || !streaming || !code) return
		viewport.scrollTop = viewport.scrollHeight
	}, [code, streaming])

	useEffect(() => {
		if (copyOutcome === "idle") return
		const timer = window.setTimeout(
			() => setCopyOutcome("idle"),
			COPY_FEEDBACK_MS,
		)
		return () => window.clearTimeout(timer)
	}, [copyOutcome])

	const handleCopy = useCallback(async () => {
		try {
			if (onCopy) await onCopy()
			else await navigator.clipboard.writeText(code)
			setCopyOutcome("copied")
		} catch {
			setCopyOutcome("failed")
		}
	}, [code, onCopy])

	return (
		<div
			data-slot="code-block"
			data-status={status}
			aria-busy={streaming}
			className={cn(
				"w-full overflow-hidden rounded-2xl border bg-background text-sm",
				className,
			)}
		>
			<div className="flex h-10 items-center gap-2.5 border-b px-3">
				<Icons.FileCode
					aria-hidden="true"
					className="size-3.5 shrink-0 text-muted-foreground"
				/>
				{filename ? (
					<span className="min-w-0 truncate font-mono text-foreground text-xs">
						{filename}
					</span>
				) : null}
				<span className="shrink-0 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
					{label}
				</span>
				<span
					role="status"
					className="ml-auto inline-flex shrink-0 items-center gap-1 font-medium text-[10px] text-muted-foreground"
				>
					{streaming ? (
						<Icons.Loading
							aria-hidden="true"
							className="size-3 animate-spin motion-reduce:animate-none"
						/>
					) : (
						<Icons.Check aria-hidden="true" className="size-3" />
					)}
					{streaming ? "Writing" : "Ready"}
				</span>
				{copyable ? (
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label="Copy code"
						onClick={handleCopy}
					>
						{copyOutcome === "copied" ? <Icons.Check /> : <Icons.Copy />}
					</Button>
				) : null}
			</div>

			<div
				ref={viewportRef}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: an overflowing code viewport must be keyboard scrollable
				tabIndex={0}
				role="group"
				aria-label={`Code snippet, ${filename ?? label}`}
				className="overflow-auto py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
				style={{ maxHeight }}
			>
				<pre
					className={cn(
						"m-0 font-mono text-foreground text-xs leading-5",
						wrap ? "min-w-0" : "min-w-max",
					)}
				>
					<code>
						{lines.map((line, index) => (
							<span
								key={line.offset}
								className={cn(
									"grid min-h-5",
									showLineNumbers
										? "grid-cols-[2.75rem_minmax(0,1fr)]"
										: "grid-cols-1",
									highlighted.has(index + 1) && "bg-primary/15",
								)}
							>
								{showLineNumbers ? (
									<span className="select-none pr-3 text-right text-muted-foreground tabular-nums">
										{index + 1}
									</span>
								) : null}
								<CodeLine
									content={line.content}
									tokens={line.tokens}
									className={cn(
										"pr-4",
										showLineNumbers ? "pl-1" : "pl-4",
										wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
									)}
								/>
							</span>
						))}
					</code>
				</pre>
			</div>

			<span aria-live="polite" className="sr-only">
				{COPY_ANNOUNCEMENTS[copyOutcome]}
			</span>
		</div>
	)
}
