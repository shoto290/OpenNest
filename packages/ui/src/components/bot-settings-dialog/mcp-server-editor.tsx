"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
	type BotMcpConnectionState,
	type BotMcpServerDraft,
	type BotMcpServerFields,
	isMcpServerDraftUnsaved,
	isSameFieldAnswer,
	MCP_ENDPOINT_KINDS,
	MCP_TRANSPORTS,
	parseMcpServerConfig,
	readMcpEndpointKind,
	readMcpServerFields,
	readMcpServerTransport,
	toBundleName,
	toMcpServerConfigFor,
	toMcpServerConfigText,
	toMcpServerConfigWith,
	toMcpServerWrittenConfig,
} from "@workspace/ui/components/bot-settings"
import {
	MCP_CONNECTION_DOT,
	type McpConnectionSection,
} from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import { McpServerLaunch } from "@workspace/ui/components/bot-settings-dialog/mcp-server-launch"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import {
	EnvironmentPanel,
	type EnvironmentSection,
} from "@workspace/ui/components/environment-panel"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	RAIL_LABELS_MIN_WIDTH,
	SettingsRail,
	SettingsRailBack,
	SettingsRailItem,
	SettingsRailSeparator,
	SettingsScrollingPanel,
} from "@workspace/ui/components/settings-rail"
import { SettingsSelect } from "@workspace/ui/components/settings-select"
import { SETTINGS_TAG_CLASS } from "@workspace/ui/components/settings-styles"
import { Button, buttonVariants } from "@workspace/ui/components/ui/button"
import { useIsNarrowerThan } from "@workspace/ui/hooks/use-is-narrower-than"
import { cn } from "@workspace/ui/lib/utils"

const FIRST_SECTION = "connection"

type EditorNoticeProps = {
	icon: Icon
	text: string
	danger?: boolean
}

const EditorNotice = ({
	icon: NoticeIcon,
	text,
	danger,
}: EditorNoticeProps) => (
	<p
		className={cn(
			"flex shrink-0 items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed",
			danger
				? "border-destructive/40 bg-destructive/5 text-destructive"
				: "border-border bg-muted/40 text-muted-foreground",
		)}
	>
		<NoticeIcon
			aria-hidden="true"
			className={cn(
				"mt-0.5 size-3.5 shrink-0",
				danger ? "text-destructive" : "text-foreground",
			)}
		/>
		{text}
	</p>
)

const OpensBrowserIcon = () => (
	<Icons.ExternalLink
		aria-hidden="true"
		className="size-3.5"
		data-icon="inline-start"
	/>
)

const QUIET_FIELD = "border-border bg-muted/60"

const AUTHORIZATION_FIELD = {
	connected: QUIET_FIELD,
	needsAuthorization: "border-bot-badge-attention/45 bg-bot-badge-attention/8",
	connecting: "border-bot-badge-attention/45 bg-bot-badge-attention/8",
	failed: "border-destructive/45 bg-destructive/8",
} satisfies Record<BotMcpConnectionState, string>

type McpAuthorizationProps = McpConnectionSection & {
	name: string
	isSaved: boolean
	defaultDisconnecting?: boolean
}

const McpAuthorization = ({
	state,
	host,
	authorizedAt,
	name,
	isSaved,
	defaultDisconnecting,
	onConnect,
	onCancel,
	onReopen,
	onDisconnect,
}: McpAuthorizationProps) => {
	const { t } = useTranslation("bots")
	const isWaiting = isSaved && state === "connecting"

	const readDescription = () => {
		if (!isSaved) return t("applications.connection.description.unsaved")
		if (state === "needsAuthorization")
			return t("applications.connection.description.needsAuthorization", {
				name,
			})
		if (state === "connecting")
			return host
				? t("applications.connection.description.connecting", { host })
				: null
		if (state === "connected")
			return authorizedAt
				? t("applications.connection.description.connected", {
						date: authorizedAt,
					})
				: null
		return null
	}

	const readActions = () => {
		if (!isSaved)
			return onConnect ? (
				<Button disabled size="sm">
					<OpensBrowserIcon />
					{t("applications.connection.connect")}
				</Button>
			) : null

		if (state === "needsAuthorization")
			return onConnect ? (
				<Button onClick={onConnect} size="sm">
					<OpensBrowserIcon />
					{t("applications.connection.connect")}
				</Button>
			) : null

		if (state === "failed")
			return onConnect ? (
				<Button onClick={onConnect} size="sm" variant="outline">
					{t("applications.connection.retry")}
				</Button>
			) : null

		if (state === "connecting")
			return (
				<>
					{onReopen ? (
						<Button onClick={onReopen} size="sm" variant="outline">
							<OpensBrowserIcon />
							{t("applications.connection.reopen")}
						</Button>
					) : null}
					{onCancel ? (
						<Button onClick={onCancel} size="sm" variant="ghost">
							{t("applications.connection.cancel")}
						</Button>
					) : null}
				</>
			)

		return onDisconnect ? (
			<ConfirmDialog
				confirmLabel={t("applications.connection.disconnect")}
				defaultOpen={defaultDisconnecting}
				description={t("applications.connection.confirm.description", { name })}
				onConfirm={onDisconnect}
				title={t("applications.connection.confirm.title", { name })}
				trigger={t("applications.connection.disconnect")}
				triggerClassName={buttonVariants({ variant: "outline", size: "sm" })}
			/>
		) : null
	}

	const description = readDescription()

	return (
		<div
			className={cn(
				"flex shrink-0 items-start gap-3 rounded-xl border p-3",
				isSaved ? AUTHORIZATION_FIELD[state] : QUIET_FIELD,
			)}
		>
			<span className="flex size-4 shrink-0 items-center justify-center">
				{isWaiting ? (
					<Icons.Loading
						aria-hidden="true"
						className="size-3.5 animate-spin text-bot-badge-attention motion-reduce:animate-none"
					/>
				) : (
					<span
						aria-hidden="true"
						className={cn("size-2 rounded-full", MCP_CONNECTION_DOT[state])}
					/>
				)}
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<p className="font-medium text-foreground text-sm">
					{isWaiting
						? t("applications.connection.waiting")
						: t(`applications.connection.state.${state}`)}
				</p>
				{description ? (
					<p className="text-muted-foreground text-xs">{description}</p>
				) : null}
			</div>
			<div className="flex shrink-0 items-center gap-2">{readActions()}</div>
		</div>
	)
}

type McpServerEditorProps = {
	draft: BotMcpServerDraft
	onDraftChange: (draft: BotMcpServerDraft) => void
	saved?: BotMcpServerDraft
	onBack: () => void
	onSave: (config: Record<string, unknown>) => void
	onDelete?: () => void
	connection?: McpConnectionSection
	environment?: EnvironmentSection
	defaultSection?: string
	defaultConfirming?: boolean
	defaultDisconnecting?: boolean
	defaultLeaving?: boolean
	className?: string
}

const McpServerEditor = ({
	draft,
	onDraftChange,
	saved,
	onBack,
	onSave,
	onDelete,
	connection,
	environment,
	defaultSection,
	defaultConfirming,
	defaultDisconnecting,
	defaultLeaving,
	className,
}: McpServerEditorProps) => {
	const { t } = useTranslation("bots")
	const [root, setRoot] = useState<HTMLDivElement | null>(null)
	const [isLeaving, setLeaving] = useState(Boolean(defaultLeaving))
	const [typed, setTyped] = useState<Partial<BotMcpServerFields>>({})
	const iconsOnly = useIsNarrowerThan(root, RAIL_LABELS_MIN_WIDTH)

	const name = draft.name.trim() || t("applications.untitled")
	const config = parseMcpServerConfig(draft.config)
	const fields = readMcpServerFields(config ?? {})
	const written = config && toMcpServerWrittenConfig(config, draft.transport)
	const isWritten = Boolean(saved)
	const isUnsaved = isMcpServerDraftUnsaved(draft, saved)
	const isSavable =
		Boolean(written) && isUnsaved && draft.name.trim().length > 0

	const patch = (next: Partial<BotMcpServerDraft>) =>
		onDraftChange({ ...draft, ...next })

	const shown = (field: keyof BotMcpServerFields) => {
		const raw = typed[field]

		return raw !== undefined && isSameFieldAnswer(field, raw, fields[field])
			? raw
			: fields[field]
	}

	const answer = (field: keyof BotMcpServerFields, value: string) => {
		setTyped({ ...typed, [field]: value })

		if (!config) return

		patch({
			config: toMcpServerConfigText(
				toMcpServerConfigWith(config, field, value),
			),
		})
	}

	const pickTransport = (value: string) => {
		const transport = MCP_TRANSPORTS.find((it) => it === value) ?? "local"

		patch({
			transport,
			config: config
				? toMcpServerConfigText(toMcpServerConfigFor(config, transport))
				: draft.config,
		})
	}

	const editConfig = (value: string) => {
		const next = parseMcpServerConfig(value)

		patch({
			config: value,
			transport: next
				? readMcpServerTransport(next, draft.transport)
				: draft.transport,
		})
	}

	const leave = () => (isUnsaved ? setLeaving(true) : onBack())

	const transportOptions = MCP_TRANSPORTS.map((transport) => ({
		label: t(`applications.transport.option.${transport}`),
		value: transport,
	}))

	const endpointOptions = MCP_ENDPOINT_KINDS.map((kind) => ({
		label: t(`applications.endpoint.option.${kind}`),
		value: kind,
	}))

	const unreadable = (
		<EditorNotice
			danger
			icon={Icons.Error}
			text={t("applications.config.invalid")}
		/>
	)

	return (
		<Tabs.Root
			className={cn("flex min-h-0 flex-1", className)}
			defaultValue={defaultSection ?? FIRST_SECTION}
			orientation="vertical"
			ref={setRoot}
		>
			<SettingsRail
				iconsOnly={iconsOnly}
				leading={
					<>
						<SettingsRailBack
							iconsOnly={iconsOnly}
							label={t("applications.back")}
							onClick={leave}
						/>
						<SettingsRailSeparator />
					</>
				}
			>
				<SettingsRailItem
					icon={Icons.Server}
					iconsOnly={iconsOnly}
					label={t("applications.section.connection")}
					value={FIRST_SECTION}
				/>
				<SettingsRailItem
					icon={Icons.Shield}
					iconsOnly={iconsOnly}
					label={t("applications.section.secrets")}
					value="environment"
				/>
				<SettingsRailItem
					icon={Icons.Json}
					iconsOnly={iconsOnly}
					label={t("applications.section.advanced")}
					value="advanced"
				/>
			</SettingsRail>

			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<div className="flex shrink-0 items-center justify-between gap-2 border-border border-b px-5 py-3">
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate font-medium text-foreground text-sm">
							{name}
						</span>
						{isUnsaved && isWritten ? (
							<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
								{t("applications.unsaved")}
							</span>
						) : null}
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{isWritten && onDelete ? (
							<ConfirmDialog
								confirmLabel={t("applications.delete.action")}
								defaultOpen={defaultConfirming}
								description={t("applications.delete.description")}
								onConfirm={onDelete}
								title={t("applications.delete.confirm.title", { name })}
								trigger={
									<>
										<Icons.Delete aria-hidden="true" className="size-3.5" />
										{t("applications.delete.action")}
									</>
								}
								triggerClassName={buttonVariants({
									variant: "destructive",
									size: "sm",
								})}
							/>
						) : null}
						<Button
							disabled={!isSavable}
							onClick={() => written && onSave(written)}
							size="sm"
						>
							{isWritten ? (
								<Icons.Check aria-hidden="true" className="size-3.5" />
							) : (
								<Icons.Add aria-hidden="true" className="size-3.5" />
							)}
							{isWritten ? t("applications.save") : t("applications.create")}
						</Button>
					</div>
				</div>

				<SettingsScrollingPanel value={FIRST_SECTION}>
					{connection ? (
						<McpAuthorization
							{...connection}
							defaultDisconnecting={defaultDisconnecting}
							isSaved={isWritten}
							name={name}
						/>
					) : null}
					<EditorNotice icon={Icons.Alert} text={t("applications.notice")} />
					<SettingsField
						hint={t("applications.name.hint")}
						label={t("applications.name.label")}
						onValueChange={(value) => patch({ name: toBundleName(value) })}
						placeholder={t("applications.name.placeholder")}
						value={draft.name}
					/>
					<SettingsSelect
						hint={t("applications.transport.hint")}
						label={t("applications.transport.label")}
						onValueChange={pickTransport}
						options={transportOptions}
						value={draft.transport}
					/>
					{config ? null : unreadable}
					{config && draft.transport === "local" ? (
						<>
							<SettingsField
								hint={t("applications.command.hint")}
								label={t("applications.command.label")}
								onValueChange={(value) => answer("command", value)}
								placeholder={t("applications.command.placeholder")}
								value={shown("command")}
							/>
							<SettingsField
								hint={t("applications.args.hint")}
								label={t("applications.args.label")}
								onValueChange={(value) => answer("args", value)}
								placeholder={t("applications.args.placeholder")}
								rows={4}
								value={shown("args")}
							/>
						</>
					) : null}
					{config && draft.transport === "remote" ? (
						<>
							<SettingsField
								hint={t("applications.url.hint")}
								label={t("applications.url.label")}
								onValueChange={(value) => answer("url", value)}
								placeholder={t("applications.url.placeholder")}
								value={shown("url")}
							/>
							<SettingsSelect
								hint={t("applications.endpoint.hint")}
								label={t("applications.endpoint.label")}
								onValueChange={(value) => answer("type", value)}
								options={endpointOptions}
								value={readMcpEndpointKind(fields.type)}
							/>
							<SettingsField
								hint={t("applications.headers.hint")}
								label={t("applications.headers.label")}
								onValueChange={(value) => answer("headers", value)}
								placeholder={t("applications.headers.placeholder")}
								rows={4}
								value={shown("headers")}
							/>
						</>
					) : null}
				</SettingsScrollingPanel>

				<SettingsScrollingPanel value="environment">
					{config ? (
						<SettingsField
							hint={t("applications.secrets.hint")}
							label={t("applications.secrets.label")}
							onValueChange={(value) => answer("environment", value)}
							placeholder={t("applications.secrets.placeholder")}
							rows={8}
							value={shown("environment")}
						/>
					) : (
						unreadable
					)}
					{environment ? (
						<EnvironmentPanel {...environment} scope="server" />
					) : null}
				</SettingsScrollingPanel>

				<SettingsScrollingPanel value="advanced">
					<SettingsField
						error={config ? undefined : t("applications.config.invalid")}
						hint={t("applications.config.hint")}
						label={t("applications.config.label")}
						onValueChange={editConfig}
						placeholder={t("applications.config.placeholder")}
						rows={10}
						value={draft.config}
					/>
					{config ? <McpServerLaunch config={config} /> : null}
				</SettingsScrollingPanel>
			</div>

			<ConfirmDialog
				confirmLabel={t("applications.leave.action")}
				description={t("applications.leave.description")}
				onConfirm={onBack}
				onOpenChange={setLeaving}
				open={isLeaving}
				title={t("applications.leave.title")}
			/>
		</Tabs.Root>
	)
}

export { McpServerEditor, type McpServerEditorProps }
