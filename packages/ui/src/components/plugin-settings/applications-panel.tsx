"use client"

import { useTranslation } from "react-i18next"

import type {
	BotMcpConnectionState,
	BotMcpServerItem,
} from "@workspace/ui/components/bot-settings"
import { MCP_CONNECTION_DOT } from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import { Icons } from "@workspace/ui/components/icons"
import { ApplicationMark } from "@workspace/ui/components/plugin-settings/application-mark"
import { SETTINGS_EMPTY_CLASS } from "@workspace/ui/components/settings-styles"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type InheritedApplication = {
	name: string
	mark?: string
}

type ApplicationsInheritance = {
	spaceName: string
	fromSpace: InheritedApplication[]
	fromProfile: InheritedApplication[]
}

type ApplicationsOwner =
	| { kind: "companion"; name: string; inherited?: ApplicationsInheritance }
	| {
			kind: "space"
			name: string
			companionCount?: number
			inherited?: InheritedApplication[]
	  }
	| { kind: "profile" }

type OwnerCopy = {
	intro: string
	emptyTitle: string
	emptyDescription: string
	footnote: string | null
	inherited: InheritedApplication[]
}

const NO_INHERITANCE: ApplicationsInheritance = {
	spaceName: "",
	fromSpace: [],
	fromProfile: [],
}

const useOwnerCopy = (owner: ApplicationsOwner): OwnerCopy => {
	const { t } = useTranslation("bots")

	if (owner.kind === "profile") {
		return {
			intro: t("applications.intro.profile"),
			emptyTitle: t("applications.empty.title.profile"),
			emptyDescription: t("applications.empty.description.profile"),
			footnote: t("applications.footnote.profile"),
			inherited: [],
		}
	}

	if (owner.kind === "space") {
		const { name, companionCount } = owner

		return {
			intro:
				companionCount === undefined
					? t("applications.intro.space", { name })
					: t("applications.intro.spaceCounted", {
							name,
							count: companionCount,
						}),
			emptyTitle: t("applications.empty.title.space", { name }),
			emptyDescription: t("applications.empty.description.space"),
			footnote: t("applications.footnote.space"),
			inherited: owner.inherited ?? [],
		}
	}

	const { name } = owner
	const { spaceName, fromSpace, fromProfile } =
		owner.inherited ?? NO_INHERITANCE
	const sources = [
		fromSpace.length > 0
			? t("applications.footnote.source.space", {
					count: fromSpace.length,
					name: spaceName,
				})
			: null,
		fromProfile.length > 0
			? t("applications.footnote.source.profile", {
					count: fromProfile.length,
				})
			: null,
	].filter((source) => source !== null)
	const inheritedApplications = [...fromSpace, ...fromProfile]

	return {
		intro: t("applications.intro.companion", { name }),
		emptyTitle: t("applications.empty.title.companion"),
		emptyDescription: t("applications.empty.description.companion"),
		footnote:
			inheritedApplications.length > 0
				? t("applications.footnote.companion", {
						name,
						count: inheritedApplications.length,
						sources: sources.join(", "),
					})
				: null,
		inherited: inheritedApplications,
	}
}

type ApplicationRowAction = {
	key: "connect" | "retry"
	variant: "default" | "outline"
}

const APPLICATION_ROW_ACTION = {
	connected: null,
	needsAuthorization: { key: "connect", variant: "default" },
	connecting: null,
	failed: { key: "retry", variant: "outline" },
} as const satisfies Record<BotMcpConnectionState, ApplicationRowAction | null>

type ApplicationRowProps = {
	server: BotMcpServerItem
	onOpen: () => void
	onConnect?: () => void
}

const ApplicationRow = ({ server, onOpen, onConnect }: ApplicationRowProps) => {
	const { t } = useTranslation("bots")
	const name = server.displayName ?? server.name
	const state = server.connection
	const action = state ? APPLICATION_ROW_ACTION[state] : null

	return (
		<li className="relative flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-muted">
			<button
				aria-label={t("applications.open", { name })}
				className="absolute inset-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onOpen}
				type="button"
			/>
			<ApplicationMark mark={server.mark} />
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span
					className={cn(
						"truncate font-medium text-foreground text-sm",
						!server.displayName && "font-mono",
					)}
				>
					{name}
				</span>
				<span className="flex h-4 min-w-0 items-center gap-1.5">
					{state ? (
						<>
							<span
								aria-hidden="true"
								className={cn(
									"size-2 shrink-0 rounded-full",
									MCP_CONNECTION_DOT[state],
								)}
							/>
							<span className="truncate text-muted-foreground text-xs">
								{t(`applications.connection.state.${state}`)}
							</span>
						</>
					) : null}
				</span>
			</span>
			<span className="relative flex h-6 w-18 shrink-0 items-center justify-end">
				{action && onConnect ? (
					<Button
						aria-label={t(`applications.connection.row.${action.key}`, {
							name,
						})}
						onClick={onConnect}
						size="xs"
						variant={action.variant}
					>
						{t(`applications.connection.${action.key}`)}
					</Button>
				) : null}
			</span>
			<Icons.Next
				aria-hidden="true"
				className="size-4 shrink-0 text-muted-foreground"
			/>
		</li>
	)
}

type ApplicationsPanelProps = {
	owner: ApplicationsOwner
	servers: BotMcpServerItem[]
	haveFailedToLoad?: boolean
	onOpen: (server: BotMcpServerItem) => void
	onAdd: () => void
	onPaste: () => void
	onConnect?: (server: BotMcpServerItem) => void
}

const ApplicationsPanel = ({
	owner,
	servers,
	haveFailedToLoad = false,
	onOpen,
	onAdd,
	onPaste,
	onConnect,
}: ApplicationsPanelProps) => {
	const { t } = useTranslation("bots")
	const copy = useOwnerCopy(owner)

	if (haveFailedToLoad) {
		return (
			<div className={SETTINGS_EMPTY_CLASS}>
				<Icons.Alert aria-hidden="true" className="size-8 text-destructive" />
				<p className="max-w-xs text-muted-foreground text-sm">
					{t("applications.unavailable")}
				</p>
			</div>
		)
	}

	if (servers.length === 0) {
		return (
			<div className={SETTINGS_EMPTY_CLASS}>
				<span className="flex items-center gap-2 opacity-45">
					<ApplicationMark isBlank size="sm" />
					<ApplicationMark />
					<ApplicationMark isBlank size="sm" />
				</span>
				<div className="flex flex-col items-center gap-1">
					<span className="wrap-break-word font-medium text-foreground text-sm">
						{copy.emptyTitle}
					</span>
					<p className="max-w-98 text-muted-foreground text-sm">
						{copy.emptyDescription}
					</p>
				</div>
				<div className="flex flex-wrap items-center justify-center gap-2">
					<Button onClick={onAdd} size="sm">
						<Icons.Add
							aria-hidden="true"
							className="size-3.5"
							data-icon="inline-start"
						/>
						{t("applications.add")}
					</Button>
					<Button onClick={onPaste} size="sm" variant="outline">
						{t("applications.paste")}
					</Button>
				</div>
			</div>
		)
	}

	return (
		<>
			<div className="flex shrink-0 items-center justify-between gap-3">
				<p className="min-w-0 wrap-break-word text-muted-foreground text-xs">
					{copy.intro}
				</p>
				<Button onClick={onAdd} size="sm" variant="outline">
					<Icons.Add
						aria-hidden="true"
						className="size-3.5"
						data-icon="inline-start"
					/>
					{t("applications.add")}
				</Button>
			</div>
			<ul className="flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-0">
				{servers.map((server) => (
					<ApplicationRow
						key={server.name}
						onConnect={onConnect && (() => onConnect(server))}
						onOpen={() => onOpen(server)}
						server={server}
					/>
				))}
			</ul>
			{copy.footnote ? (
				<div className="flex shrink-0 items-center gap-3 border-border border-t pt-3">
					<p className="min-w-0 grow wrap-break-word text-muted-foreground text-xs">
						{copy.footnote}
					</p>
					{copy.inherited.length > 0 ? (
						<span
							className="flex shrink-0 items-center gap-1.5"
							data-slot="inherited-marks"
						>
							{copy.inherited.map((application) => (
								<ApplicationMark
									key={application.name}
									mark={application.mark}
									size="xs"
								/>
							))}
						</span>
					) : null}
				</div>
			) : null}
		</>
	)
}

export {
	type ApplicationsInheritance,
	type ApplicationsOwner,
	ApplicationsPanel,
	type ApplicationsPanelProps,
	type InheritedApplication,
}
