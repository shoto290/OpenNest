"use client"

import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { EmptyStateShell } from "@workspace/ui/components/empty-state-shell"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import { Notice } from "@workspace/ui/components/notice"
import { FIELD_LABEL_CLASS } from "@workspace/ui/components/settings-styles"
import { toRelativeTime } from "@workspace/ui/lib/relative-time"
import { cn } from "@workspace/ui/lib/utils"

const ROUTINE_DETAIL_EDIT_OPENER = "detail-edit-routine"

const ROUTINE_RUN_OUTCOMES = [
	"reported",
	"nothing",
	"skipped",
	"failed",
] as const

type RoutineRunOutcome = (typeof ROUTINE_RUN_OUTCOMES)[number]

const ROUTINE_RUN_REFUSALS = [
	"disabled",
	"filter",
	"dedupeValueMissing",
	"alreadySeen",
] as const

type RoutineRunRefusal = (typeof ROUTINE_RUN_REFUSALS)[number]

type RoutineRunModel = {
	id: string
	startedAt: number
	outcome: RoutineRunOutcome | null
	reason?: string
}

type RoutineDetailModel = {
	id: string
	title: string
	triggerSourceTitle: string
	hasStoppedItself: boolean
	runs: RoutineRunModel[]
	isReadingRuns: boolean
	hasFailedToReadRuns: boolean
	hasReadFullPage: boolean
	isRunning: boolean
	refusal?: RoutineRunRefusal
	now: number
}

type RoutineDetailProps = RoutineDetailModel & {
	onEdit: () => void
	onRetryRuns: () => void
	onRunNow: () => void
}

const RUN_ROW_CLASS =
	"flex flex-col gap-1 rounded-xl border border-border bg-muted/40 p-2.5"

const SEPARATOR_CLASS = "before:mx-1.5 before:content-['·']"

type RunState = RoutineRunOutcome | "running"

const RUN_STATE_MARK: Record<RunState, Icon> = {
	reported: Icons.Success,
	nothing: Icons.Pending,
	skipped: Icons.Blocked,
	failed: Icons.Error,
	running: Icons.Loading,
}

const RUN_STATE_MARK_CLASS: Record<RunState, string> = {
	reported: "text-foreground",
	nothing: "text-muted-foreground",
	skipped: "text-muted-foreground",
	failed: "text-destructive",
	running: "animate-spin text-muted-foreground motion-reduce:animate-none",
}

type RunRowProps = {
	run: RoutineRunModel
	now: number
}

const RunRow = ({ run, now }: RunRowProps) => {
	const { t, i18n } = useTranslation("chat")
	const state: RunState = run.outcome ?? "running"
	const Mark = RUN_STATE_MARK[state]

	return (
		<li className={RUN_ROW_CLASS} data-slot="routine-run">
			<span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
				<span className="flex min-w-0 items-center gap-1.5">
					<Mark
						aria-hidden="true"
						className={cn(
							"size-3.5 shrink-0 self-center",
							RUN_STATE_MARK_CLASS[state],
						)}
					/>
					<span className="wrap-break-word font-medium text-xs">
						{t(`routines.detail.history.outcome.${state}`)}
					</span>
				</span>
				<span className="ms-auto text-muted-foreground text-xs tabular-nums">
					{toRelativeTime(run.startedAt, i18n.language, now)}
				</span>
			</span>
			{run.reason ? (
				<p
					className="wrap-break-word text-muted-foreground text-xs"
					data-slot="routine-run-reason"
				>
					{run.reason}
				</p>
			) : null}
		</li>
	)
}

type RunHistoryProps = Pick<
	RoutineDetailProps,
	| "runs"
	| "isReadingRuns"
	| "hasFailedToReadRuns"
	| "hasReadFullPage"
	| "now"
	| "onRetryRuns"
>

const RunHistory = ({
	runs,
	isReadingRuns,
	hasFailedToReadRuns,
	hasReadFullPage,
	now,
	onRetryRuns,
}: RunHistoryProps) => {
	const { t, i18n } = useTranslation("chat")

	const notice = hasFailedToReadRuns ? (
		<Notice
			description={t("routines.detail.history.failure.description")}
			retry={{ onRetry: onRetryRuns, isBusy: isReadingRuns }}
			title={t("routines.detail.history.failure.title")}
		/>
	) : null

	const newestFirst = [...runs].sort((a, b) => b.startedAt - a.startedAt)
	const latest = newestFirst[0]

	if (!latest && notice) {
		return notice
	}

	if (!latest && isReadingRuns) {
		return (
			<p
				className="flex items-center gap-2 text-muted-foreground text-xs"
				data-slot="routine-runs-reading"
				role="status"
			>
				<Icons.Loading
					aria-hidden="true"
					className="size-3.5 animate-spin motion-reduce:animate-none"
				/>
				{t("routines.detail.history.reading")}
			</p>
		)
	}

	if (!latest) {
		return (
			<EmptyStateShell
				data-slot="routine-runs-empty"
				description={t("routines.detail.history.empty.description")}
				mark={
					<Icons.History
						aria-hidden="true"
						className="size-8 text-muted-foreground"
					/>
				}
				title={t("routines.detail.history.empty.title")}
			/>
		)
	}

	const reported = newestFirst.filter(
		({ outcome }) => outcome === "reported",
	).length

	return (
		<>
			{notice}
			<p
				className="flex flex-wrap items-baseline text-muted-foreground text-xs tabular-nums"
				data-slot="routine-runs-aggregate"
			>
				<span>
					{t(
						hasReadFullPage
							? "routines.detail.history.page"
							: "routines.detail.history.counted",
						{ count: newestFirst.length },
					)}
				</span>
				<span className={SEPARATOR_CLASS}>
					{t("routines.detail.history.reported", { count: reported })}
				</span>
				<span className={SEPARATOR_CLASS}>
					{t("routines.detail.history.latest", {
						when: toRelativeTime(latest.startedAt, i18n.language, now),
					})}
				</span>
			</p>
			<ul className="flex flex-col gap-2" data-slot="routine-runs">
				{newestFirst.map((run) => (
					<RunRow key={run.id} now={now} run={run} />
				))}
			</ul>
		</>
	)
}

const RoutineDetail = ({
	title,
	triggerSourceTitle,
	hasStoppedItself,
	isRunning,
	refusal,
	onEdit,
	onRunNow,
	...history
}: RoutineDetailProps) => {
	const { t } = useTranslation("chat")
	const surface = useRef<HTMLDivElement>(null)

	useEffect(() => {
		surface.current?.focus({ preventScroll: true })
	}, [])

	return (
		<div
			className="flex flex-col gap-4 outline-none"
			data-slot="routine-detail"
			ref={surface}
			tabIndex={-1}
		>
			<div className="flex flex-col gap-1">
				<h3 className="wrap-break-word font-medium text-base text-foreground">
					{title}
				</h3>
				<span className="flex flex-wrap items-center gap-1.5">
					<span className="wrap-break-word text-muted-foreground text-xs">
						{triggerSourceTitle}
					</span>
					{hasStoppedItself ? (
						<Badge data-slot="routine-stopped" variant="destructive">
							{t("routines.row.stopped")}
						</Badge>
					) : null}
				</span>
			</div>

			<div className="flex flex-wrap gap-2">
				<Button
					className="flex-1"
					data-opens={ROUTINE_DETAIL_EDIT_OPENER}
					onClick={onEdit}
					variant="outline"
				>
					<Icons.Edit aria-hidden="true" />
					{t("routines.form.edit")}
				</Button>
				<Button
					aria-busy={isRunning}
					aria-disabled={isRunning}
					className="flex-1 aria-disabled:opacity-50"
					onClick={isRunning ? undefined : onRunNow}
				>
					<Icons.Restart
						aria-hidden="true"
						className={cn(
							isRunning && "animate-spin motion-reduce:animate-none",
						)}
					/>
					{t("routines.detail.runNow.action")}
				</Button>
			</div>

			<p
				className="flex items-start gap-1.5 text-muted-foreground text-xs empty:absolute"
				data-slot="routine-run-refusal"
				role="status"
			>
				{refusal ? (
					<>
						<Icons.Info aria-hidden="true" className="size-3.5 shrink-0" />
						<span className="wrap-break-word">
							{t(`routines.detail.runNow.refusal.${refusal}`)}
						</span>
					</>
				) : null}
			</p>

			<div className="flex flex-col gap-2">
				<h3 className={FIELD_LABEL_CLASS}>
					{t("routines.detail.history.label")}
				</h3>
				<RunHistory {...history} />
			</div>
		</div>
	)
}

export {
	ROUTINE_DETAIL_EDIT_OPENER,
	ROUTINE_RUN_OUTCOMES,
	ROUTINE_RUN_REFUSALS,
	RoutineDetail,
	type RoutineDetailModel,
	type RoutineDetailProps,
	type RoutineRunModel,
	type RoutineRunOutcome,
	type RoutineRunRefusal,
}
