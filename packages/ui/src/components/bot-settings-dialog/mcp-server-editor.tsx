"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
	type BotMcpServerDraft,
	type BotMcpServerFields,
	isMcpServerDraftUnsaved,
	isSameFieldAnswer,
	MCP_ENDPOINT_KINDS,
	MCP_TRANSPORTS,
	parseMcpServerConfig,
	readMcpEndpointKind,
	readMcpSecretReferences,
	readMcpServerFields,
	readMcpServerTransport,
	toBundleName,
	toMcpServerConfigFor,
	toMcpServerConfigText,
	toMcpServerConfigWith,
	toMcpServerWrittenConfig,
} from "@workspace/ui/components/bot-settings"
import { McpServerLaunch } from "@workspace/ui/components/bot-settings-dialog/mcp-server-launch"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import {
	BLANK_SECRETS,
	type SecretScope,
	type SecretsValue,
} from "@workspace/ui/components/secrets-settings/secrets"
import { SecretsPanel } from "@workspace/ui/components/secrets-settings/secrets-panel"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	RAIL_LABELS_MIN_WIDTH,
	SETTINGS_SCROLLING_PANEL_CLASS,
	SettingsRail,
	SettingsRailBack,
	SettingsRailItem,
	SettingsRailSeparator,
} from "@workspace/ui/components/settings-rail"
import { SettingsSelect } from "@workspace/ui/components/settings-select"
import { SETTINGS_TAG_CLASS } from "@workspace/ui/components/settings-styles"
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

type McpServerEditorProps = {
	draft: BotMcpServerDraft
	onDraftChange: (draft: BotMcpServerDraft) => void
	saved?: BotMcpServerDraft
	onBack: () => void
	onSave: (config: Record<string, unknown>) => void
	onDelete?: () => void
	secrets?: SecretsValue
	onSecretSave?: (key: string, secret: string) => void
	onSecretDelete?: (key: string, scope: SecretScope, server?: string) => void
	onVaultUnlock?: (passphrase: string) => void
	defaultSection?: string
	defaultConfirming?: boolean
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
	secrets = BLANK_SECRETS,
	onSecretSave,
	onSecretDelete,
	onVaultUnlock,
	defaultSection,
	defaultConfirming,
	defaultLeaving,
	className,
}: McpServerEditorProps) => {
	const { t } = useTranslation("bots")
	const [root, setRoot] = useState<HTMLDivElement | null>(null)
	const [isLeaving, setLeaving] = useState(Boolean(defaultLeaving))
	const [typed, setTyped] = useState<Partial<BotMcpServerFields>>({})
	const iconsOnly = useIsNarrowerThan(root, RAIL_LABELS_MIN_WIDTH)

	const name = draft.name.trim() || t("mcp.untitled")
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
		label: t(`mcp.transport.option.${transport}`),
		value: transport,
	}))

	const endpointOptions = MCP_ENDPOINT_KINDS.map((kind) => ({
		label: t(`mcp.endpoint.option.${kind}`),
		value: kind,
	}))

	const unreadable = (
		<EditorNotice danger icon={Icons.Error} text={t("mcp.config.invalid")} />
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
							label={t("mcp.back")}
							onClick={leave}
						/>
						<SettingsRailSeparator />
					</>
				}
			>
				<SettingsRailItem
					icon={Icons.Server}
					iconsOnly={iconsOnly}
					label={t("mcp.section.connection")}
					value={FIRST_SECTION}
				/>
				<SettingsRailItem
					icon={Icons.Shield}
					iconsOnly={iconsOnly}
					label={t("mcp.section.environment")}
					value="environment"
				/>
				<SettingsRailItem
					icon={Icons.Key}
					iconsOnly={iconsOnly}
					label={t("mcp.section.secrets")}
					value="secrets"
				/>
				<SettingsRailItem
					icon={Icons.Json}
					iconsOnly={iconsOnly}
					label={t("mcp.section.advanced")}
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
								{t("mcp.unsaved")}
							</span>
						) : null}
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{isWritten && onDelete ? (
							<ConfirmDialog
								confirmLabel={t("mcp.delete.action")}
								defaultOpen={defaultConfirming}
								description={t("mcp.delete.description")}
								onConfirm={onDelete}
								title={t("mcp.delete.confirm.title", { name })}
								trigger={
									<>
										<Icons.Delete aria-hidden="true" className="size-3.5" />
										{t("mcp.delete.action")}
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
							{isWritten ? t("mcp.save") : t("mcp.create")}
						</Button>
					</div>
				</div>

				<Tabs.Panel
					className={SETTINGS_SCROLLING_PANEL_CLASS}
					value={FIRST_SECTION}
				>
					<EditorNotice icon={Icons.Alert} text={t("mcp.notice")} />
					<SettingsField
						hint={t("mcp.name.hint")}
						label={t("mcp.name.label")}
						onValueChange={(value) => patch({ name: toBundleName(value) })}
						placeholder={t("mcp.name.placeholder")}
						value={draft.name}
					/>
					<SettingsSelect
						hint={t("mcp.transport.hint")}
						label={t("mcp.transport.label")}
						onValueChange={pickTransport}
						options={transportOptions}
						value={draft.transport}
					/>
					{config ? null : unreadable}
					{config && draft.transport === "local" ? (
						<>
							<SettingsField
								hint={t("mcp.command.hint")}
								label={t("mcp.command.label")}
								onValueChange={(value) => answer("command", value)}
								placeholder={t("mcp.command.placeholder")}
								value={shown("command")}
							/>
							<SettingsField
								hint={t("mcp.args.hint")}
								label={t("mcp.args.label")}
								onValueChange={(value) => answer("args", value)}
								placeholder={t("mcp.args.placeholder")}
								rows={4}
								value={shown("args")}
							/>
						</>
					) : null}
					{config && draft.transport === "remote" ? (
						<>
							<SettingsField
								hint={t("mcp.url.hint")}
								label={t("mcp.url.label")}
								onValueChange={(value) => answer("url", value)}
								placeholder={t("mcp.url.placeholder")}
								value={shown("url")}
							/>
							<SettingsSelect
								hint={t("mcp.endpoint.hint")}
								label={t("mcp.endpoint.label")}
								onValueChange={(value) => answer("type", value)}
								options={endpointOptions}
								value={readMcpEndpointKind(fields.type)}
							/>
							<SettingsField
								hint={t("mcp.headers.hint")}
								label={t("mcp.headers.label")}
								onValueChange={(value) => answer("headers", value)}
								placeholder={t("mcp.headers.placeholder")}
								rows={4}
								value={shown("headers")}
							/>
						</>
					) : null}
				</Tabs.Panel>

				<Tabs.Panel
					className={SETTINGS_SCROLLING_PANEL_CLASS}
					value="environment"
				>
					{config ? (
						<SettingsField
							hint={t("mcp.environment.hint")}
							label={t("mcp.environment.label")}
							onValueChange={(value) => answer("environment", value)}
							placeholder={t("mcp.environment.placeholder")}
							rows={8}
							value={shown("environment")}
						/>
					) : (
						unreadable
					)}
				</Tabs.Panel>

				<Tabs.Panel className={SETTINGS_SCROLLING_PANEL_CLASS} value="secrets">
					{isWritten && config ? (
						<SecretsPanel
							onDelete={(key, scope, server) =>
								onSecretDelete?.(key, scope, server)
							}
							onSave={(key, secret) => onSecretSave?.(key, secret)}
							onVaultUnlock={(passphrase) => onVaultUnlock?.(passphrase)}
							references={readMcpSecretReferences(config)}
							value={secrets}
						/>
					) : (
						<EditorNotice
							icon={Icons.Alert}
							text={config ? t("mcp.secrets.unsaved") : t("mcp.config.invalid")}
						/>
					)}
				</Tabs.Panel>

				<Tabs.Panel className={SETTINGS_SCROLLING_PANEL_CLASS} value="advanced">
					<SettingsField
						error={config ? undefined : t("mcp.config.invalid")}
						hint={t("mcp.config.hint")}
						label={t("mcp.config.label")}
						onValueChange={editConfig}
						placeholder={t("mcp.config.placeholder")}
						rows={10}
						value={draft.config}
					/>
					{config ? <McpServerLaunch config={config} /> : null}
				</Tabs.Panel>
			</div>

			<ConfirmDialog
				confirmLabel={t("mcp.leave.action")}
				description={t("mcp.leave.description")}
				onConfirm={onBack}
				onOpenChange={setLeaving}
				open={isLeaving}
				title={t("mcp.leave.title")}
			/>
		</Tabs.Root>
	)
}

export { McpServerEditor, type McpServerEditorProps }
