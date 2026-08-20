"use client"
// Adapted from beui.dev/components/agents/tool-approval

import { motion, useReducedMotion } from "motion/react"
import { type ReactNode, useCallback, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import {
	AgentCode,
	type AgentCodeLanguage,
} from "@workspace/ui/components/agents/agent-code"
import { AgentDisclosure } from "@workspace/ui/components/agents/agent-disclosure"
import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { EASE_OUT, SPRING_SWAP } from "@workspace/ui/lib/ease"
import { cn } from "@workspace/ui/lib/utils"

/** Mirrors the Claude Code `canUseTool` outcomes: the callback is pending until
 * it returns `{ behavior: "allow" }` or `{ behavior: "deny" }`. */
export type ToolApprovalStatus = "pending" | "allowed" | "denied"

/** A curated row of the tool input. `sensitive` rows carry no value at all, so a
 * secret cannot reach the DOM even by accident. */
export type ToolApprovalParameter = {
	id: string
	label: ReactNode
} & (
	| { value: ReactNode; sensitive?: false }
	| { sensitive: true; value?: never }
)

export interface ToolApprovalCodeProps {
	code: string
	language?: AgentCodeLanguage
	className?: string
}

export interface ToolApprovalProps {
	tool: ReactNode
	title?: ReactNode
	description?: ReactNode
	parameters?: ToolApprovalParameter[]
	status?: ToolApprovalStatus
	open?: boolean
	defaultOpen?: boolean
	onOpenChange?: (open: boolean) => void
	onAllowOnce?: () => void
	onDeny?: () => void
	children?: ReactNode
	className?: string
}

const STATUS_BADGE: Record<ToolApprovalStatus, string> = {
	pending: "border-border bg-muted text-foreground",
	allowed: "border-border bg-muted text-foreground",
	denied: "border-destructive/40 bg-background text-destructive",
}

function StatusIcon({ status }: { status: ToolApprovalStatus }) {
	if (status === "allowed") return <Icons.Success className="size-4" />
	if (status === "denied") return <Icons.Close className="size-4" />
	return <Icons.Shield className="size-4" />
}

export function ToolApprovalCode({
	code,
	language = "bash",
	className,
}: ToolApprovalCodeProps) {
	return (
		<AgentCode
			code={code}
			language={language}
			className={cn(
				"rounded-xl border border-border bg-muted/40 px-2.5 py-2",
				className,
			)}
		/>
	)
}

export function ToolApproval({
	tool,
	title,
	description,
	parameters = [],
	status = "pending",
	open,
	defaultOpen = false,
	onOpenChange,
	onAllowOnce,
	onDeny,
	children,
	className,
}: ToolApprovalProps) {
	const { t } = useTranslation("chat")
	const reduce = useReducedMotion() ?? false
	const baseId = useId()
	const titleId = `${baseId}-title`
	const detailsId = `${baseId}-details`
	const [internalOpen, setInternalOpen] = useState(defaultOpen)
	const currentOpen = open ?? internalOpen

	const toggleDetails = useCallback(() => {
		const next = !(open ?? internalOpen)
		if (open === undefined) setInternalOpen(next)
		onOpenChange?.(next)
	}, [internalOpen, onOpenChange, open])

	return (
		<div
			role="group"
			aria-labelledby={titleId}
			data-status={status}
			className={cn(
				"w-full overflow-hidden rounded-2xl border border-border bg-card text-sm",
				className,
			)}
		>
			<div className="flex items-start gap-3 p-4">
				<span
					aria-hidden="true"
					className={cn(
						"mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border border-border bg-background text-muted-foreground",
						status === "denied" && "text-destructive",
					)}
				>
					<StatusIcon status={status} />
				</span>

				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-start justify-between gap-3">
						<div className="min-w-0">
							<div id={titleId} className="font-medium text-foreground">
								{title ?? t("toolApproval.title")}
							</div>
							<div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
								{tool}
							</div>
						</div>
						<span
							role="status"
							className={cn(
								"shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
								STATUS_BADGE[status],
							)}
						>
							{t(`toolApproval.status.${status}`)}
						</span>
					</div>

					{description ? (
						<p className="mt-2 leading-5 text-muted-foreground">
							{description}
						</p>
					) : null}

					{children ? <div className="mt-3">{children}</div> : null}

					{parameters.length ? (
						<Button
							variant="ghost"
							size="xs"
							aria-expanded={currentOpen}
							aria-controls={detailsId}
							onClick={toggleDetails}
							className="mt-2 -ml-2.5 text-muted-foreground"
						>
							{t("toolApproval.input")}
							<motion.span
								data-icon="inline-end"
								animate={{ rotate: currentOpen ? 180 : 0 }}
								transition={reduce ? { duration: 0 } : SPRING_SWAP}
							>
								<Icons.Expand className="size-3" />
							</motion.span>
						</Button>
					) : null}
				</div>
			</div>

			<AgentDisclosure id={detailsId} open={currentOpen}>
				<dl className="mx-4 mb-4 grid gap-2 rounded-xl border border-border bg-muted/40 p-3">
					{parameters.map((parameter) => (
						<div
							key={parameter.id}
							className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-baseline gap-3 text-xs"
						>
							<dt className="text-muted-foreground">{parameter.label}</dt>
							<dd
								className={cn(
									"min-w-0 break-words font-mono text-foreground",
									parameter.sensitive && "text-muted-foreground italic",
								)}
							>
								{parameter.sensitive
									? t("toolApproval.sensitive")
									: parameter.value}
							</dd>
						</div>
					))}
				</dl>
			</AgentDisclosure>

			{status === "pending" ? (
				<motion.div
					initial={reduce ? false : { y: 4 }}
					animate={{ y: 0 }}
					transition={{ duration: 0.22, ease: EASE_OUT }}
					className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3"
				>
					<Button size="sm" onClick={onAllowOnce}>
						<Icons.Success data-icon="inline-start" />
						{t("toolApproval.allowOnce")}
					</Button>
					<Button variant="outline" size="sm" onClick={onDeny}>
						<Icons.Close data-icon="inline-start" />
						{t("toolApproval.deny")}
					</Button>
				</motion.div>
			) : null}
		</div>
	)
}
