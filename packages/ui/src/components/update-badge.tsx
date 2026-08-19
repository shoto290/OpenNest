"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/motion/popover"
import { ProgressRoot } from "@workspace/ui/components/progress"
import { cn } from "@workspace/ui/lib/utils"

type UpdateBadgeStatus =
	| "idle"
	| "available"
	| "downloading"
	| "ready"
	| "error"

interface UpdateBadgeProps {
	status: UpdateBadgeStatus
	/** Version the download carries, rendered in the panel once it is ready. */
	version?: string
	/** One line per change, rendered as the panel's release notes. */
	releaseNotes?: string[]
	/** Share of the download already on disk, 0 to 100. */
	progress?: number
	/** Bots still running. Above zero the restart is refused and counted. */
	activeBotCount?: number
	onDownload?: () => void
	onRestart?: () => void
	/** Fired once when the reader postpones. Postponing is final: the panel
	 * never opens itself again. */
	onPostpone?: () => void
	className?: string
}

/** A fixed footprint, so the sidebar column does not shift when the ring
 * appears around the button or the glyph changes. */
const BADGE_FRAME = "relative inline-flex size-9 items-center justify-center"

const BADGE_BUTTON = "rounded-full"

const UPDATE_BADGE_LABEL = {
	available: "Download update",
	downloading: "Downloading update",
	ready: "Restart to update",
	error: "Update failed, download again",
} satisfies Record<Exclude<UpdateBadgeStatus, "idle">, string>

const RING_BOX = 36
const RING_RADIUS = 16
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface UpdateRingProps {
	value: number
	children: React.ReactNode
}

/** The download read as an arc closing around the button. */
const UpdateRing = ({ value, children }: UpdateRingProps) => (
	<ProgressRoot
		aria-label="Update download progress"
		data-slot="update-badge-ring"
		value={value}
		className={BADGE_FRAME}
	>
		<svg
			aria-hidden="true"
			viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
			className="-rotate-90 absolute inset-0 size-full"
		>
			<circle
				cx={RING_BOX / 2}
				cy={RING_BOX / 2}
				r={RING_RADIUS}
				strokeWidth="2"
				className="fill-none stroke-border"
			/>
			<circle
				cx={RING_BOX / 2}
				cy={RING_BOX / 2}
				r={RING_RADIUS}
				strokeWidth="2"
				strokeLinecap="round"
				strokeDasharray={RING_CIRCUMFERENCE}
				strokeDashoffset={RING_CIRCUMFERENCE * (1 - value / 100)}
				className="fill-none stroke-primary transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none"
			/>
		</svg>
		{children}
	</ProgressRoot>
)

interface UpdateActionProps {
	status: Extract<UpdateBadgeStatus, "available" | "downloading" | "error">
	progress: number
	onDownload?: () => void
	className?: string
}

/** Everything before the update is on disk: one circular button that starts, or
 * restarts, the download — and the ring while it runs. */
const UpdateAction = ({
	status,
	progress,
	onDownload,
	className,
}: UpdateActionProps) => {
	const isDownloading = status === "downloading"
	const label = UPDATE_BADGE_LABEL[status]
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
		return <span className={cn(BADGE_FRAME, className)}>{button}</span>

	return <UpdateRing value={progress}>{button}</UpdateRing>
}

interface UpdateReadyProps {
	version?: string
	releaseNotes: string[]
	activeBotCount: number
	onRestart?: () => void
	onPostpone?: () => void
	className?: string
}

const botsBusyCopy = (count: number) =>
	`${count} ${count === 1 ? "bot is" : "bots are"} still running. Stop them to restart.`

/** The download landed: the glyph turns into a restart and the panel opens on
 * its own — once. Postponing closes it for good; only a deliberate click on the
 * badge brings it back. */
const UpdateReady = ({
	version,
	releaseNotes,
	activeBotCount,
	onRestart,
	onPostpone,
	className,
}: UpdateReadyProps) => {
	const [isOpen, setIsOpen] = useState(true)
	const isBlocked = activeBotCount > 0

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
			className={cn(BADGE_FRAME, className)}
		>
			<PopoverTrigger>
				<Button
					data-slot="update-badge"
					data-status="ready"
					aria-label={UPDATE_BADGE_LABEL.ready}
					size="icon-sm"
					variant="default"
					className={BADGE_BUTTON}
				>
					<Icons.Restart />
				</Button>
			</PopoverTrigger>
			<PopoverContent aria-label="Update ready">
				<div data-slot="update-panel" className="flex flex-col gap-3">
					<div className="flex flex-col gap-1">
						<p className="font-medium text-sm">Update ready</p>
						{version ? (
							<p className="text-muted-foreground text-xs">Version {version}</p>
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
							{botsBusyCopy(activeBotCount)}
						</p>
					) : null}
					<div className="flex items-center gap-2">
						<Button size="sm" disabled={isBlocked} onClick={onRestart}>
							Restart now
						</Button>
						<Button size="sm" variant="ghost" onClick={postpone}>
							Later
						</Button>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}

/** The sidebar's update pastille. Props say everything: it never reaches the
 * network and never talks to the host — the caller polls the updater and hands
 * down a status. Nothing is rendered until there is something to install. */
const UpdateBadge = ({
	status,
	version,
	releaseNotes = [],
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
