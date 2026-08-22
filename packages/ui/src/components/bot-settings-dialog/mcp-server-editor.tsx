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

/** The section a server opens on: where it is reached and what it is called is the
 * whole of what makes a server that server, and every other section is an answer
 * about that one. */
const FIRST_SECTION = "connection"

type EditorNoticeProps = {
	icon: Icon
	text: string
	/** Whether the notice is about something being wrong rather than about something
	 * being worth knowing. */
	danger?: boolean
}

/** One sentence standing above the fields it is about. Two of them are needed here
 * and both are the same object: what a server is before one is added, and why a
 * section has no fields to show. */
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
	/** Fired on every keystroke — the editor keeps no draft of its own. Nothing is
	 * written from it: the save is its own press. */
	onDraftChange: (draft: BotMcpServerDraft) => void
	/** The server as it stands where it is kept, which is what the draft is weighed
	 * against to know there is something to save. Left out for a server that does not
	 * exist yet: the save then reads as a creation. */
	saved?: BotMcpServerDraft
	/** Back to the list the editor was opened from. Reached through a question while
	 * anything is unsaved. */
	onBack: () => void
	/** Fired with the parsed configuration, never with the text. Only reachable while
	 * the name is filled, the JSON parses and something has changed. */
	onSave: (config: Record<string, unknown>) => void
	/** Fired only once the confirmation is accepted. Left out for a server that does
	 * not exist yet — there is nothing kept to take away. */
	onDelete?: () => void
	/** Which section the editor mounts on. Read once, as it mounts. */
	defaultSection?: string
	/** Whether the delete mounts with its question already up. Read once. */
	defaultConfirming?: boolean
	/** Whether the way out mounts with its question already up. Read once. */
	defaultLeaving?: boolean
	className?: string
}

/**
 * One MCP server, whole, on the whole surface: a rail of sections down the left and
 * one section at a time on the right. Connection is where the server is reached,
 * Environment is what it starts with, Advanced is the configuration itself.
 *
 * The fields and the JSON are two readings of one thing. A field answered is carried
 * into the text, the text edited is carried back into the fields, and every key no
 * field names is kept untouched — the shape belongs to the transport, so a form of
 * fixed fields would be a lie the day a server names something this side has never
 * heard of. Which fields stand under Connection is the transport's answer: a local
 * server names a command and its arguments, a remote one an address and its headers.
 *
 * Nothing is written as it is typed. The name is the key the server is filed under,
 * so a rename typed letter by letter would file one server per keystroke, and a
 * half-written configuration is not JSON at all. The save is a press, and the way out
 * asks before it drops a draft.
 */
const McpServerEditor = ({
	draft,
	onDraftChange,
	saved,
	onBack,
	onSave,
	onDelete,
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
	// What the save would write, which is not always what the text shows: a remote
	// server is written with the kind of endpoint it is reached by, because an address
	// with no `type` beside it is a server the runtime skips outright.
	const written = config && toMcpServerWrittenConfig(config, draft.transport)
	const isWritten = Boolean(saved)
	const isUnsaved = isMcpServerDraftUnsaved(draft, saved)
	const isSavable =
		Boolean(written) && isUnsaved && draft.name.trim().length > 0

	const patch = (next: Partial<BotMcpServerDraft>) =>
		onDraftChange({ ...draft, ...next })

	// Every field is read back out of the configuration on every keystroke, and a
	// half-typed line laid out again under the caret would take the line back from the
	// typist — `A` becoming `A: ` before the second letter arrives. So what was typed
	// stands for as long as it says what the configuration says, and the configuration
	// wins the moment it says anything else, which is what an edit to the JSON is.
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

	// The text is the configuration, so what it names is what the fields answer —
	// the transport included: a text that has grown an address is a remote server
	// whatever the select was left on. A text naming neither is left as it stands.
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

	// A section whose fields are read out of the configuration has none to show while
	// the text is not one: writing a field back would drop everything typed around it.
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
