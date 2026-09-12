"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { Notice } from "@workspace/ui/components/notice"
import { CommitDiff } from "@workspace/ui/components/plugin-settings/commit-diff"
import type { HistoryChangeFile } from "@workspace/ui/components/plugin-settings/history-panel"
import {
	RAIL_ITEM_CLASS,
	SettingsRail,
	SettingsRailBack,
	SettingsRailSeparator,
	SettingsScrollingPanel,
} from "@workspace/ui/components/settings-rail"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import { buttonVariants } from "@workspace/ui/components/ui/button"
import { useFittingCandidate } from "@workspace/ui/hooks/use-fitting-candidate"
import { cn } from "@workspace/ui/lib/utils"

const META_SEPARATOR = " · "

const FOLD_MARK = "…"

const BODY_CLASS = "flex flex-col gap-4 px-5 py-4"

const HEAD_CLASS =
	"flex shrink-0 flex-col gap-0.5 border-border border-b px-5 py-3"

const FOOT_CLASS =
	"flex shrink-0 items-center gap-3.5 border-border border-t px-5 py-3"

const UNDO_CLASS = "shrink-0 rounded-md font-medium text-xs/4"

const FILE_ROW_CLASS = cn(
	RAIL_ITEM_CLASS,
	"relative overflow-hidden text-start",
)

const CANDIDATES_CLASS = "pointer-events-none invisible absolute top-0 w-max"

const CANDIDATE_CLASS = "block w-max whitespace-nowrap"

const foldsOf = (path: string) => {
	const segments = path.split("/")

	return segments.map((_, dropped) =>
		dropped === 0 ? path : `${FOLD_MARK}/${segments.slice(dropped).join("/")}`,
	)
}

const countChangedLines = (patch: string) => {
	let added = 0
	let removed = 0

	for (const line of patch.split("\n")) {
		if (line.startsWith("+++") || line.startsWith("---")) continue
		if (line.startsWith("+")) added += 1
		if (line.startsWith("-")) removed += 1
	}

	return { added, removed }
}

type HistoryFileTabProps = {
	path: string
}

const HistoryFileTab = ({ path }: HistoryFileTabProps) => {
	const [candidates, setCandidates] = useState<HTMLElement | null>(null)
	const [label, setLabel] = useState<HTMLElement | null>(null)
	const folds = foldsOf(path)
	const fitting = useFittingCandidate(candidates, label)

	const row = (
		<Tabs.Tab className={FILE_ROW_CLASS} data-slot="history-file" value={path}>
			<Icons.File
				aria-hidden="true"
				className="size-4 shrink-0"
				data-slot="history-file-glyph"
			/>
			<span aria-hidden="true" className={CANDIDATES_CLASS} ref={setCandidates}>
				{folds.map((fold) => (
					<span className={CANDIDATE_CLASS} key={fold}>
						{fold}
					</span>
				))}
			</span>
			<span
				className="block min-w-0 flex-1 truncate"
				data-slot="history-file-path"
				ref={setLabel}
			>
				{folds[fitting] ?? path}
			</span>
		</Tabs.Tab>
	)

	return fitting === 0 ? (
		row
	) : (
		<TooltipHint content={path} side="right">
			{row}
		</TooltipHint>
	)
}

type HistoryChangePageProps = {
	title: string
	author: string
	date: string
	reason?: string
	retouchCount?: number
	files: HistoryChangeFile[]
	areFilesReading?: boolean
	haveFilesFailedToRead?: boolean
	onBack: () => void
	onUndo: () => void
	className?: string
}

const HistoryChangePage = ({
	title,
	author,
	date,
	reason,
	retouchCount,
	files,
	areFilesReading = false,
	haveFilesFailedToRead = false,
	onBack,
	onUndo,
	className,
}: HistoryChangePageProps) => {
	const { t } = useTranslation("bots")
	const [chosen, setChosen] = useState<string | null>(null)

	const chosenPath =
		files.find((file) => file.path === chosen)?.path ?? files[0]?.path ?? null

	const meta = [
		author,
		date,
		retouchCount ? t("history.retouches", { count: retouchCount }) : null,
	]
		.filter(Boolean)
		.join(META_SEPARATOR)

	const countedIn = (patch: string) => {
		const { added, removed } = countChangedLines(patch)

		return [
			added ? t("history.change.added", { count: added }) : null,
			removed ? t("history.change.removed", { count: removed }) : null,
		]
			.filter(Boolean)
			.join(", ")
	}

	const bodyOf = () => {
		if (areFilesReading && !haveFilesFailedToRead)
			return (
				<div
					className={cn(
						BODY_CLASS,
						"min-h-0 flex-1 flex-row items-center gap-2 text-muted-foreground text-xs/4",
					)}
				>
					<Icons.Loading
						aria-hidden="true"
						className="size-3.5 animate-spin motion-reduce:animate-none"
					/>
					{t("history.diff.loading")}
				</div>
			)

		if (haveFilesFailedToRead || files.length === 0)
			return (
				<div className={cn(BODY_CLASS, "min-h-0 flex-1")}>
					<Notice title={t("history.change.unavailable")} />
				</div>
			)

		return files.map((file) => (
			<SettingsScrollingPanel isFlush key={file.path} value={file.path}>
				<div className={BODY_CLASS}>
					{reason ? (
						<p className="text-foreground text-sm/5">{reason}</p>
					) : null}
					<div className="flex items-baseline gap-2">
						<span className="min-w-0 break-words font-mono text-foreground text-xs/4">
							{file.path}
						</span>
						<span className="shrink-0 text-muted-foreground text-xs/4">
							{countedIn(file.patch)}
						</span>
					</div>
					<CommitDiff patch={file.patch} />
				</div>
			</SettingsScrollingPanel>
		))
	}

	return (
		<Tabs.Root
			className={cn("flex min-h-0 flex-1", className)}
			onValueChange={(value) => setChosen(String(value))}
			orientation="vertical"
			value={chosenPath}
		>
			<SettingsRail
				iconsOnly={false}
				leading={
					<>
						<SettingsRailBack
							iconsOnly={false}
							label={t("history.change.back")}
							onClick={onBack}
						/>
						<SettingsRailSeparator />
					</>
				}
			>
				{files.map((file) => (
					<HistoryFileTab key={file.path} path={file.path} />
				))}
			</SettingsRail>

			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<header className={HEAD_CLASS}>
					<h2 className="truncate font-medium text-foreground text-sm/5">
						{title}
					</h2>
					<p className="text-muted-foreground text-xs/4">{meta}</p>
				</header>

				{bodyOf()}

				<div className={FOOT_CLASS}>
					<ConfirmDialog
						confirmLabel={t("history.undo.confirm")}
						description={t("history.undo.description")}
						onConfirm={onUndo}
						title={t("history.undo.title", { title })}
						trigger={
							<>
								<Icons.Restart aria-hidden="true" className="size-3.5" />
								{t("history.undo.confirm")}
							</>
						}
						triggerClassName={cn(
							buttonVariants({ variant: "outline", size: "sm" }),
							UNDO_CLASS,
						)}
					/>
					<p className="min-w-0 flex-1 text-muted-foreground text-xs/4">
						{files.length === 0
							? t("history.change.consequence.uncounted")
							: t("history.change.consequence.counted", {
									count: files.length,
								})}
					</p>
				</div>
			</div>
		</Tabs.Root>
	)
}

export { HistoryChangePage, type HistoryChangePageProps }
