"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/motion/popover"
import { Tooltip } from "@workspace/ui/components/motion/tooltip"
import { ProgressRing } from "@workspace/ui/components/progress"
import { cn } from "@workspace/ui/lib/utils"

type UpdateBadgeStatus =
	| "idle"
	| "available"
	| "downloading"
	| "ready"
	| "error"

interface UpdateBadgeProps {
	status: UpdateBadgeStatus
	version?: string
	releaseNotes?: string[]
	releaseNotesUrl?: string
	progress?: number
	activeBotCount?: number
	onDownload?: () => void
	onRestart?: () => void
	onPostpone?: () => void
	className?: string
}

const BADGE_SIZE = "size-9"

const BADGE_FRAME = "inline-flex items-center justify-center"

const BADGE_BUTTON = "rounded-full"

interface UpdateActionProps {
	status: Extract<UpdateBadgeStatus, "available" | "downloading" | "error">
	progress: number
	onDownload?: () => void
	className?: string
}

const UpdateAction = ({
	status,
	progress,
	onDownload,
	className,
}: UpdateActionProps) => {
	const { t } = useTranslation("common")
	const isDownloading = status === "downloading"
	const label = t(`update.badge.${status}`)
	const button = (
		<Button
			data-slot="update-badge"
			data-status={status}
			aria-label={label}
			tooltip={label}
			tooltipSide="right"
			size="icon-sm"
			variant={status === "error" ? "destructive" : "default"}
			disabled={isDownloading}
			onClick={onDownload}
			className={BADGE_BUTTON}
		>
			{status === "error" ? <Icons.Retry /> : <Icons.ArrowUp />}
		</Button>
	)

	if (!isDownloading)
		return (
			<span className={cn(BADGE_FRAME, BADGE_SIZE, className)}>{button}</span>
		)

	return (
		<ProgressRing
			aria-label={label}
			className={cn(BADGE_SIZE, className)}
			data-slot="update-badge-ring"
			value={progress}
		>
			{button}
		</ProgressRing>
	)
}

interface ReleaseNotesLinkProps {
	href: string
}

const ReleaseNotesLink = ({ href }: ReleaseNotesLinkProps) => {
	const { t } = useTranslation("common")
	const label = t("update.panel.releaseNotes")

	return (
		<Tooltip content={label} side="right" wrapperClassName="ml-auto">
			<a
				data-slot="update-release-notes"
				aria-label={label}
				href={href}
				target="_blank"
				rel="noreferrer noopener"
				className={cn(
					buttonVariants({ variant: "ghost", size: "icon-sm" }),
					"text-muted-foreground",
				)}
			>
				<Icons.ExternalLink />
			</a>
		</Tooltip>
	)
}

interface UpdateReadyProps {
	version?: string
	releaseNotes: string[]
	releaseNotesUrl?: string
	activeBotCount: number
	onRestart?: () => void
	onPostpone?: () => void
	className?: string
}

const UpdateReady = ({
	version,
	releaseNotes,
	releaseNotesUrl,
	activeBotCount,
	onRestart,
	onPostpone,
	className,
}: UpdateReadyProps) => {
	const { t } = useTranslation("common")
	const [isOpen, setIsOpen] = useState(true)
	const isBlocked = activeBotCount > 0
	const title = t("update.panel.title")

	const postpone = () => {
		setIsOpen(false)
		onPostpone?.()
	}

	return (
		<Popover
			open={isOpen}
			onOpenChange={setIsOpen}
			side="top"
			align="start"
			className={cn(BADGE_FRAME, BADGE_SIZE, className)}
		>
			<PopoverTrigger>
				<Button
					data-slot="update-badge"
					data-status="ready"
					aria-label={t("update.badge.ready")}
					size="icon-sm"
					variant="default"
					className={BADGE_BUTTON}
				>
					<Icons.Restart />
				</Button>
			</PopoverTrigger>
			<PopoverContent aria-label={title}>
				<div data-slot="update-panel" className="flex flex-col gap-3">
					<div className="flex flex-col gap-1">
						<p className="font-medium text-sm">{title}</p>
						{version ? (
							<p className="text-muted-foreground text-xs">
								{t("update.panel.version", { version })}
							</p>
						) : null}
					</div>
					{releaseNotes.length > 0 ? (
						<ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground text-xs">
							{releaseNotes.map((note) => (
								<li key={note}>{note}</li>
							))}
						</ul>
					) : null}
					{isBlocked ? (
						<p className="text-amber-600 text-xs dark:text-amber-400">
							{t("update.panel.botsBusy", { count: activeBotCount })}
						</p>
					) : null}
					<div className="flex items-center gap-2">
						<Button size="sm" disabled={isBlocked} onClick={onRestart}>
							{t("update.panel.restart")}
						</Button>
						<Button size="sm" variant="ghost" onClick={postpone}>
							{t("update.panel.postpone")}
						</Button>
						{releaseNotesUrl ? (
							<ReleaseNotesLink href={releaseNotesUrl} />
						) : null}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}

const UpdateBadge = ({
	status,
	version,
	releaseNotes = [],
	releaseNotesUrl,
	progress = 0,
	activeBotCount = 0,
	onDownload,
	onRestart,
	onPostpone,
	className,
}: UpdateBadgeProps) => {
	if (status === "idle") return null

	if (status === "ready")
		return (
			<UpdateReady
				version={version}
				releaseNotes={releaseNotes}
				releaseNotesUrl={releaseNotesUrl}
				activeBotCount={activeBotCount}
				onRestart={onRestart}
				onPostpone={onPostpone}
				className={className}
			/>
		)

	return (
		<UpdateAction
			status={status}
			progress={progress}
			onDownload={onDownload}
			className={className}
		/>
	)
}

export { UpdateBadge, type UpdateBadgeProps, type UpdateBadgeStatus }
