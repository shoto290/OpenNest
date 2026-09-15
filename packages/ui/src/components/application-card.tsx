"use client"

import { useTranslation } from "react-i18next"

import { MCP_CONNECTION_DOT } from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import { ApplicationMark } from "@workspace/ui/components/plugin-settings/application-mark"
import type { ApplicationSetup } from "@workspace/ui/components/plugin-settings/applications-catalogue"
import { cn } from "@workspace/ui/lib/utils"

type ApplicationCardStatus = ApplicationSetup | "waiting" | "connected"

type ApplicationStatusLook = {
	label:
		| `applications.catalogue.setup.${ApplicationSetup}`
		| "applications.connection.waiting"
		| "applications.connection.state.connected"
	glyph?: Icon
	tone: string
	labelTone: string
}

const APPLICATION_STATUS = {
	none: {
		label: "applications.catalogue.setup.none",
		glyph: Icons.Check,
		tone: "text-state-connected",
		labelTone: "text-muted-foreground",
	},
	apiKey: {
		label: "applications.catalogue.setup.apiKey",
		glyph: Icons.Key,
		tone: "text-muted-foreground",
		labelTone: "text-muted-foreground",
	},
	signIn: {
		label: "applications.catalogue.setup.signIn",
		tone: MCP_CONNECTION_DOT.needsAuthorization,
		labelTone: "text-muted-foreground",
	},
	waiting: {
		label: "applications.connection.waiting",
		tone: MCP_CONNECTION_DOT.needsAuthorization,
		labelTone: "text-muted-foreground",
	},
	connected: {
		label: "applications.connection.state.connected",
		tone: "bg-state-connected",
		labelTone: "text-foreground",
	},
} as const satisfies Record<ApplicationCardStatus, ApplicationStatusLook>

type ApplicationCardFootnote = {
	sentence: string
	actionLabel: string
	onAction: () => void
}

type ApplicationCardProps = {
	name: string
	displayName?: string
	mark?: string
	description: string
	status: ApplicationCardStatus
	footnote?: ApplicationCardFootnote
}

type ApplicationCardHeaderProps = Omit<ApplicationCardProps, "footnote"> & {
	className?: string
}

const ApplicationCardHeader = ({
	name,
	displayName,
	mark,
	description,
	status,
	className,
}: ApplicationCardHeaderProps) => {
	const { t } = useTranslation("bots")
	const look: ApplicationStatusLook = APPLICATION_STATUS[status]
	const Glyph = look.glyph

	return (
		<div
			className={cn("flex min-w-0 items-center gap-2.5 px-3 py-2.5", className)}
			data-slot="application-card"
		>
			<ApplicationMark mark={mark} size="card" />
			<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
				<div className="flex min-w-0 flex-1 basis-32 flex-col">
					<span
						className={cn(
							"truncate font-medium text-foreground leading-5",
							displayName ? "text-sm" : "font-mono text-compact",
						)}
						data-slot="application-card-name"
					>
						{displayName ?? name}
					</span>
					<span className="wrap-break-word text-muted-foreground text-xs leading-4">
						{description}
					</span>
				</div>
				<span
					className="flex min-w-0 items-center gap-1.25 text-xs leading-4"
					data-slot="application-card-status"
				>
					{Glyph ? (
						<Glyph
							aria-hidden="true"
							className={cn("size-3.25 shrink-0", look.tone)}
						/>
					) : (
						<span
							aria-hidden="true"
							className={cn("size-2 shrink-0 rounded-full", look.tone)}
						/>
					)}
					<span className={cn("wrap-break-word", look.labelTone)}>
						{t(look.label)}
					</span>
				</span>
			</div>
		</div>
	)
}

const ApplicationCard = ({ footnote, ...application }: ApplicationCardProps) =>
	footnote ? (
		<div
			className="w-full max-w-117.5 overflow-hidden rounded-control border border-border bg-background"
			data-slot="application-receipt"
		>
			<ApplicationCardHeader {...application} />
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-border border-t px-3 py-2">
				<p className="min-w-0 wrap-break-word text-muted-foreground text-xs leading-4">
					{footnote.sentence}
				</p>
				<button
					className="-my-1 ms-auto shrink-0 cursor-pointer rounded-sm py-1 font-medium text-foreground text-xs leading-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
					onClick={footnote.onAction}
					type="button"
				>
					{footnote.actionLabel}
				</button>
			</div>
		</div>
	) : (
		<ApplicationCardHeader
			className="rounded-control bg-background"
			{...application}
		/>
	)

export {
	ApplicationCard,
	type ApplicationCardFootnote,
	type ApplicationCardProps,
	type ApplicationCardStatus,
}
