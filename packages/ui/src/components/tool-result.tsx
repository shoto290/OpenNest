"use client"

import { motion, useReducedMotion } from "motion/react"
import {
	type ComponentType,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react"

import {
	AgentCode,
	type AgentCodeLanguage,
} from "@workspace/ui/components/agents/agent-code"
import { AgentDisclosure } from "@workspace/ui/components/agents/agent-disclosure"
import { Icons, type IconProps } from "@workspace/ui/components/icons"
import { ActionSwapRollText } from "@workspace/ui/components/motion/action-swap-roll"
import { SPRING_PRESS, SPRING_SWAP } from "@workspace/ui/lib/ease"
import { cn } from "@workspace/ui/lib/utils"

export type ToolResultStatus = "running" | "success" | "error" | "cancelled"
export type ToolResultKind = "terminal" | "request" | "custom"

export interface ToolResultProps {
	tool: ReactNode
	title: ReactNode
	children: ReactNode
	status?: ToolResultStatus
	kind?: ToolResultKind
	meta?: ReactNode
	icon?: ReactNode
	open?: boolean
	defaultOpen?: boolean
	onOpenChange?: (open: boolean) => void
	collapseOnComplete?: boolean
	maxHeight?: number
	copyText?: string
	onCopy?: () => void | Promise<void>
	onRetry?: () => void
	className?: string
	contentClassName?: string
}

export interface ToolResultOutputProps {
	children: string
	language?: AgentCodeLanguage
	className?: string
}

const STATUS_LABEL: Record<ToolResultStatus, string> = {
	running: "Running",
	success: "Completed",
	error: "Failed",
	cancelled: "Cancelled",
}

const STATUS_CLASS: Record<ToolResultStatus, string> = {
	running: "text-blue-700 dark:text-blue-400",
	success: "text-emerald-700 dark:text-emerald-400",
	error: "text-destructive",
	cancelled: "text-muted-foreground",
}

const STATUS_ICON: Record<ToolResultStatus, ComponentType<IconProps>> = {
	running: Icons.Loading,
	success: Icons.Success,
	error: Icons.Error,
	cancelled: Icons.Blocked,
}

const KIND_ICON: Record<ToolResultKind, ComponentType<IconProps>> = {
	terminal: Icons.Terminal,
	request: Icons.Json,
	custom: Icons.Tool,
}

function getSwapKey(value: ReactNode, fallback: string) {
	return typeof value === "string" || typeof value === "number"
		? String(value)
		: fallback
}

function KindIcon({ kind }: { kind: ToolResultKind }) {
	const Icon = KIND_ICON[kind]
	return <Icon aria-hidden="true" className="size-4" />
}

function StatusIcon({
	status,
	reduce,
}: {
	status: ToolResultStatus
	reduce: boolean
}) {
	const Icon = STATUS_ICON[status]
	return (
		<Icon
			aria-hidden="true"
			className={cn(
				"size-3.5",
				status === "running" && !reduce && "animate-spin",
			)}
		/>
	)
}

function ToolResultAction({
	label,
	onClick,
	children,
}: {
	label: string
	onClick: () => void
	children: ReactNode
}) {
	const reduce = useReducedMotion() ?? false

	return (
		<motion.button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			whileTap={reduce ? undefined : { scale: 0.9 }}
			transition={SPRING_PRESS}
			className="grid size-7 place-items-center rounded-md text-foreground/70 outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
		>
			{children}
		</motion.button>
	)
}

export function ToolResultOutput({
	children,
	language = "bash",
	className,
}: ToolResultOutputProps) {
	return (
		<AgentCode
			code={children}
			language={language}
			className={cn("whitespace-pre-wrap break-words", className)}
		/>
	)
}

export function ToolResult({
	tool,
	title,
	children,
	status = "running",
	kind = "custom",
	meta,
	icon,
	open,
	defaultOpen = true,
	onOpenChange,
	collapseOnComplete = true,
	maxHeight = 220,
	copyText,
	onCopy,
	onRetry,
	className,
	contentClassName,
}: ToolResultProps) {
	const reduce = useReducedMotion() ?? false
	const baseId = useId()
	const triggerId = `${baseId}-trigger`
	const contentId = `${baseId}-content`
	const viewportRef = useRef<HTMLDivElement>(null)
	const previousStatus = useRef(status)
	const copyTimer = useRef<number | undefined>(undefined)
	const [copied, setCopied] = useState(false)
	const [internalOpen, setInternalOpen] = useState(defaultOpen)
	const currentOpen = open ?? internalOpen
	const running = status === "running"
	const canCopy = Boolean(copyText || onCopy)
	const statusLabel = STATUS_LABEL[status]

	const setOpen = useCallback(
		(next: boolean) => {
			if (open === undefined) setInternalOpen(next)
			onOpenChange?.(next)
		},
		[onOpenChange, open],
	)

	useEffect(() => {
		if (previousStatus.current !== "running" && status === "running") {
			setOpen(true)
		}
		if (
			previousStatus.current === "running" &&
			status !== "running" &&
			collapseOnComplete
		) {
			setOpen(false)
		}
		previousStatus.current = status
	}, [collapseOnComplete, setOpen, status])

	useEffect(
		() => () => {
			if (copyTimer.current) window.clearTimeout(copyTimer.current)
		},
		[],
	)

	useLayoutEffect(() => {
		const viewport = viewportRef.current
		if (!viewport || !currentOpen || !running) return

		const frame = requestAnimationFrame(() => {
			if (typeof viewport.scrollTo === "function") {
				viewport.scrollTo({
					top: viewport.scrollHeight,
					behavior: reduce ? "auto" : "smooth",
				})
			} else {
				viewport.scrollTop = viewport.scrollHeight
			}
		})
		return () => cancelAnimationFrame(frame)
	})

	const handleCopy = useCallback(async () => {
		if (onCopy) await onCopy()
		else if (copyText) await navigator.clipboard?.writeText(copyText)

		setCopied(true)
		if (copyTimer.current) window.clearTimeout(copyTimer.current)
		copyTimer.current = window.setTimeout(() => setCopied(false), 1600)
	}, [copyText, onCopy])

	return (
		<div
			data-status={status}
			aria-busy={running}
			className={cn("w-full text-sm", className)}
		>
			<button
				id={triggerId}
				type="button"
				aria-expanded={currentOpen}
				aria-controls={contentId}
				onClick={() => setOpen(!currentOpen)}
				className="group flex min-h-9 w-full items-center gap-2 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
			>
				<span className="grid size-4 shrink-0 place-items-center text-muted-foreground">
					{icon ?? <KindIcon kind={kind} />}
				</span>
				<span className="flex min-w-0 flex-1 items-baseline gap-2">
					<span className="min-w-0 truncate font-medium text-foreground">
						{title}
					</span>
					{meta ? (
						<span className="shrink-0 text-muted-foreground text-xs">
							<ActionSwapRollText value={getSwapKey(meta, status)}>
								{meta}
							</ActionSwapRollText>
						</span>
					) : null}
					<span className="min-w-0 truncate font-mono text-muted-foreground text-xs">
						{tool}
					</span>
				</span>
				<span
					className={cn(
						"inline-flex shrink-0 items-center gap-1 font-medium text-xs",
						STATUS_CLASS[status],
					)}
				>
					<StatusIcon status={status} reduce={reduce} />
					<ActionSwapRollText value={status}>{statusLabel}</ActionSwapRollText>
				</span>
				<motion.span
					aria-hidden="true"
					animate={{ rotate: currentOpen ? 180 : 0 }}
					transition={reduce ? { duration: 0 } : SPRING_SWAP}
					className="shrink-0 text-muted-foreground"
				>
					<Icons.Expand className="size-4" />
				</motion.span>
			</button>

			<AgentDisclosure
				id={contentId}
				role="region"
				aria-labelledby={triggerId}
				open={currentOpen}
			>
				<div className="pt-1.5 pl-6">
					<div className="overflow-hidden rounded-xl bg-muted">
						<div
							ref={viewportRef}
							// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must stay reachable without a pointer.
							tabIndex={0}
							role="log"
							aria-live="polite"
							aria-label={`${statusLabel} output`}
							className="overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
							style={{ maxHeight }}
						>
							<div className={cn("p-3 text-foreground/85", contentClassName)}>
								{children}
							</div>
						</div>

						{canCopy || onRetry ? (
							<div className="flex items-center gap-0.5 px-2 pb-1.5">
								{canCopy ? (
									<ToolResultAction
										label={copied ? "Copied" : "Copy result"}
										onClick={handleCopy}
									>
										{copied ? (
											<Icons.Check className="size-4" />
										) : (
											<Icons.Copy className="size-4" />
										)}
									</ToolResultAction>
								) : null}
								{onRetry ? (
									<ToolResultAction label="Run again" onClick={onRetry}>
										<Icons.Retry className="size-4" />
									</ToolResultAction>
								) : null}
							</div>
						) : null}
					</div>
				</div>
			</AgentDisclosure>
		</div>
	)
}
