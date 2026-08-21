"use client"

import { useTranslation } from "react-i18next"

import {
	type BotMcpServerDraft,
	parseMcpServerConfig,
	toMcpServerName,
} from "@workspace/ui/components/bot-settings"
import { McpServerLaunch } from "@workspace/ui/components/bot-settings-dialog/mcp-server-launch"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { SettingsField } from "@workspace/ui/components/settings-field"

type McpServerEditorProps = {
	draft: BotMcpServerDraft
	/** Fired on every keystroke — the editor keeps no draft of its own. Nothing is
	 * written from it: the save is its own press. */
	onDraftChange: (draft: BotMcpServerDraft) => void
	/** Back to the list the editor was opened from. */
	onBack: () => void
	/** Fired with the parsed configuration, never with the text. Only reachable
	 * while the name is filled and the JSON parses. */
	onSave: (config: Record<string, unknown>) => void
	/** Fired only once the confirmation is accepted. Left out for a server that does
	 * not exist yet — and it is also what tells the two apart, since a server nobody
	 * has written has nothing to take away. */
	onDelete?: () => void
	/** Whether the question mounts already up. Read once, as the editor mounts. */
	defaultConfirming?: boolean
}

/**
 * One MCP server, whole: what it is declared under, what starting it means, and the
 * configuration itself.
 *
 * The configuration is raw JSON on purpose. A server's shape belongs to its
 * transport — a local one names a command, its arguments and its environment, a
 * remote one names a URL — so a form of three fields would be a lie the day the
 * second kind arrives, and the store keeps the shape open for exactly that reason.
 * What a form would have given for free is given back above the field instead: the
 * reading says what will run before it runs, and the notice above both says what a
 * server is, because this is the first thing in the app that starts a program on the
 * reader's own machine.
 *
 * Nothing is written as it is typed, unlike a skill. The name is the key the server
 * is filed under, so a rename typed letter by letter would file one server per
 * keystroke, and a half-written configuration is not JSON at all. There is no valid
 * intermediate state to save, so the save is a press.
 */
const McpServerEditor = ({
	draft,
	onDraftChange,
	onBack,
	onSave,
	onDelete,
	defaultConfirming,
}: McpServerEditorProps) => {
	const { t } = useTranslation("bots")
	const name = draft.name.trim() || t("mcp.untitled")
	const config = parseMcpServerConfig(draft.config)
	const isNamed = draft.name.trim().length > 0

	const patch = (fields: Partial<BotMcpServerDraft>) =>
		onDraftChange({ ...draft, ...fields })

	return (
		<>
			<div className="flex shrink-0 items-center justify-between gap-2">
				<Button onClick={onBack} size="sm" variant="ghost">
					<Icons.Previous aria-hidden="true" className="size-3.5" />
					{t("mcp.back")}
				</Button>
				{onDelete ? (
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
			</div>

			<p className="flex shrink-0 items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-muted-foreground text-xs leading-relaxed">
				<Icons.Alert
					aria-hidden="true"
					className="mt-0.5 size-3.5 shrink-0 text-foreground"
				/>
				{t("mcp.notice")}
			</p>

			<SettingsField
				hint={t("mcp.name.hint")}
				label={t("mcp.name.label")}
				onValueChange={(value) => patch({ name: toMcpServerName(value) })}
				placeholder={t("mcp.name.placeholder")}
				value={draft.name}
			/>

			<SettingsField
				error={config ? undefined : t("mcp.config.invalid")}
				hint={t("mcp.config.hint")}
				label={t("mcp.config.label")}
				onValueChange={(value) => patch({ config: value })}
				placeholder={t("mcp.config.placeholder")}
				rows={8}
				value={draft.config}
			/>

			{config ? <McpServerLaunch config={config} /> : null}

			<div className="flex shrink-0 justify-end">
				<Button
					disabled={!config || !isNamed}
					onClick={() => config && onSave(config)}
					size="sm"
				>
					{onDelete ? (
						<Icons.Check aria-hidden="true" className="size-3.5" />
					) : (
						<Icons.Add aria-hidden="true" className="size-3.5" />
					)}
					{t(onDelete ? "mcp.save" : "mcp.create")}
				</Button>
			</div>
		</>
	)
}

export { McpServerEditor, type McpServerEditorProps }
