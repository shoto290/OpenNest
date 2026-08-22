"use client"

import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import type { BotCommitItem } from "@workspace/ui/components/bot-settings"
import { Button } from "@workspace/ui/components/button"
import { CodeBlock } from "@workspace/ui/components/code-block"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { SETTINGS_EMPTY_CLASS } from "@workspace/ui/components/settings-styles"
import { toRelativeTime } from "@workspace/ui/lib/relative-time"
import { cn } from "@workspace/ui/lib/utils"

type HistoryPanelProps = {
	commits: BotCommitItem[]
	/** The name the bot's own commits are signed with. The reader's are signed
	 * "You" — a reader knows their own name. */
	botName: string
	/** Fired the moment a commit is opened. The diff is the host's to fetch and to
	 * write back on the commit; this panel asks and waits. */
	onLoadDiff: (commitId: string) => void
	onRevert: (commitId: string) => void
}

const ROW_CLASS =
	"flex flex-col gap-2 rounded-xl border border-border px-3 py-2.5"

/** The dot standing between who and when. Drawn rather than written: a separator
 * is punctuation, not a word anybody translates. */
const SEPARATOR_CLASS = "before:mr-1.5 before:content-['·']"

/**
 * Everything that has ever changed in a bot's bundle, newest first: what the change
 * was, who made it and when. It is written for a reader who does not read diffs —
 * the title leads, the body says what it meant, and the diff itself is folded away
 * behind a disclosure, asked for only once somebody opens it.
 *
 * The panel keeps only what is open. The commits, their diffs and the undoing are
 * all the host's: opening a commit asks for its diff and shows it once it arrives,
 * and Undo asks its question here but is answered upstream, as a new commit.
 */
const HistoryPanel = ({
	commits,
	botName,
	onLoadDiff,
	onRevert,
}: HistoryPanelProps) => {
	const { t, i18n } = useTranslation("bots")
	const panelId = useId()
	const [expanded, setExpanded] = useState<string[]>([])
	const [reverting, setReverting] = useState<BotCommitItem | null>(null)

	const newestFirst = [...commits].sort((a, b) => b.at - a.at)
	const now = Date.now()

	const toggle = (commit: BotCommitItem) => {
		if (expanded.includes(commit.id)) {
			setExpanded(expanded.filter((id) => id !== commit.id))
			return
		}

		setExpanded([...expanded, commit.id])
		onLoadDiff(commit.id)
	}

	if (newestFirst.length === 0) {
		return (
			<div className={SETTINGS_EMPTY_CLASS}>
				<Icons.History
					aria-hidden="true"
					className="size-8 text-muted-foreground"
				/>
				<p className="max-w-xs text-muted-foreground text-sm">
					{t("history.empty")}
				</p>
			</div>
		)
	}

	return (
		<>
			<ul className="flex min-h-0 flex-1 list-none flex-col gap-2 p-0">
				{newestFirst.map((commit) => {
					const isOpen = expanded.includes(commit.id)
					const diffId = `${panelId}-${commit.id}`

					return (
						<li className={ROW_CLASS} key={commit.id}>
							<div className="flex items-start gap-3">
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="font-medium text-foreground text-sm">
										{commit.title}
									</span>
									{commit.body ? (
										<p className="text-muted-foreground text-sm">
											{commit.body}
										</p>
									) : null}
									<span className="flex min-w-0 items-baseline text-muted-foreground text-xs">
										<span className="truncate">
											{commit.author === "user"
												? t("history.author.user")
												: botName}
										</span>
										<span className={SEPARATOR_CLASS}>
											{toRelativeTime(commit.at, i18n.language, now)}
										</span>
									</span>
								</div>
								<Button
									onClick={() => setReverting(commit)}
									size="sm"
									variant="outline"
								>
									<Icons.Restart aria-hidden="true" className="size-3.5" />
									{t("history.undo.action")}
								</Button>
							</div>

							<button
								aria-controls={diffId}
								aria-expanded={isOpen}
								className="-mx-1 flex w-fit cursor-pointer items-center gap-1 rounded-lg px-1 py-0.5 text-muted-foreground text-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
								onClick={() => toggle(commit)}
								type="button"
							>
								<Icons.Expand
									aria-hidden="true"
									className={cn(
										"size-3.5 transition-transform duration-150 motion-reduce:transition-none",
										isOpen && "rotate-180",
									)}
								/>
								{isOpen ? t("history.diff.hide") : t("history.diff.show")}
							</button>

							{isOpen ? (
								<div id={diffId}>
									{commit.diff === undefined ? (
										<span className="flex items-center gap-2 text-muted-foreground text-xs">
											<Icons.Loading
												aria-hidden="true"
												className="size-3.5 animate-spin motion-reduce:animate-none"
											/>
											{t("history.diff.loading")}
										</span>
									) : (
										<CodeBlock
											code={commit.diff}
											filename={t("history.diff.filename")}
											language="diff"
											showLineNumbers={false}
										/>
									)}
								</div>
							) : null}
						</li>
					)
				})}
			</ul>

			<ConfirmDialog
				confirmLabel={t("history.undo.confirm")}
				description={t("history.undo.description")}
				onConfirm={() => reverting && onRevert(reverting.id)}
				onOpenChange={(open) => !open && setReverting(null)}
				open={Boolean(reverting)}
				title={t("history.undo.title", { title: reverting?.title ?? "" })}
			/>
		</>
	)
}

export { HistoryPanel, type HistoryPanelProps }
