"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
	type BotMcpServerDraft,
	type BotMcpServerItem,
	toMcpServerConfigText,
} from "@workspace/ui/components/bot-settings"
import { McpServerEditor } from "@workspace/ui/components/bot-settings-dialog/mcp-server-editor"
import { readMcpServerLaunch } from "@workspace/ui/components/bot-settings-dialog/mcp-server-launch"
import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"

/** What a blank editor opens on: the two keys a local server always has, so the
 * reader is answering a shape rather than facing an empty box. */
const BLANK_SERVER: BotMcpServerDraft = {
	name: "",
	config: '{\n  "command": "",\n  "args": []\n}',
}

const toDraft = (server: BotMcpServerItem): BotMcpServerDraft => ({
	name: server.name,
	config: toMcpServerConfigText(server.config),
})

type McpServersPanelProps = {
	servers: BotMcpServerItem[]
	/** Fired once the reader saves, with the name they gave and the parsed
	 * configuration. */
	onCreate: (name: string, config: Record<string, unknown>) => void
	/** Fired once the reader saves, addressed by the name the editor was opened on —
	 * which is where the server is filed, so a rename is a move rather than a second
	 * server. */
	onChange: (
		openedName: string,
		name: string,
		config: Record<string, unknown>,
	) => void
	/** Fired only once the confirmation is accepted. */
	onDelete: (name: string) => void
	/** Which server the panel mounts opened on. Read once, as the panel mounts. */
	defaultOpenServerName?: string
	/** Whether it mounts on the blank editor instead. Read once, as the panel
	 * mounts. */
	defaultAdding?: boolean
}

/**
 * Every MCP server a bot declares, and the one being written. The list is the
 * resting state — the name it connects as and the one line that says what starting it
 * means — and opening a row hands the whole panel to that server, because a
 * configuration is JSON somebody reads line by line.
 *
 * The panel keeps no server of its own: it holds which one is open and the draft
 * being written. Everything else is reported to the surface, which owns the writing.
 */
const McpServersPanel = ({
	servers,
	onCreate,
	onChange,
	onDelete,
	defaultOpenServerName,
	defaultAdding,
}: McpServersPanelProps) => {
	const { t } = useTranslation("bots")
	const opened = servers.find((server) => server.name === defaultOpenServerName)
	// The name the editor was opened on, kept beside the draft: the draft's own name
	// is the reader's to change, and the write still has to reach the server they
	// opened.
	const [openedName, setOpenedName] = useState<string | null>(
		opened?.name ?? null,
	)
	const [draft, setDraft] = useState<BotMcpServerDraft | null>(
		defaultAdding ? BLANK_SERVER : (opened && toDraft(opened)) || null,
	)

	const close = () => {
		setDraft(null)
		setOpenedName(null)
	}

	const add = () => {
		setDraft(BLANK_SERVER)
		setOpenedName(null)
	}

	const open = (server: BotMcpServerItem) => {
		setDraft(toDraft(server))
		setOpenedName(server.name)
	}

	if (draft) {
		return (
			<McpServerEditor
				draft={draft}
				onBack={close}
				onDelete={
					openedName
						? () => {
								onDelete(openedName)
								close()
							}
						: undefined
				}
				onDraftChange={setDraft}
				onSave={(config) => {
					if (openedName) {
						onChange(openedName, draft.name, config)
					} else {
						onCreate(draft.name, config)
					}
					close()
				}}
			/>
		)
	}

	if (servers.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
				<Icons.Server
					aria-hidden="true"
					className="size-8 text-muted-foreground"
				/>
				<div className="flex flex-col gap-1">
					<span className="font-medium text-foreground text-sm">
						{t("mcp.empty.title")}
					</span>
					<p className="max-w-xs text-muted-foreground text-sm">
						{t("mcp.empty.description")}
					</p>
				</div>
				<Button onClick={add} size="sm">
					<Icons.Add aria-hidden="true" className="size-3.5" />
					{t("mcp.add")}
				</Button>
			</div>
		)
	}

	return (
		<>
			<div className="flex shrink-0 justify-end">
				<Button onClick={add} size="sm" variant="outline">
					<Icons.Add aria-hidden="true" className="size-3.5" />
					{t("mcp.add")}
				</Button>
			</div>
			<ul className="flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-0">
				{servers.map((server) => {
					const launch = readMcpServerLaunch(server.config)

					return (
						<li key={server.name}>
							<button
								className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
								onClick={() => open(server)}
								type="button"
							>
								<span className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="truncate font-medium text-foreground text-sm">
										{server.name}
									</span>
									<span className="truncate font-mono text-muted-foreground text-xs">
										{launch.command ?? launch.url ?? t("mcp.launch.unknown")}
									</span>
								</span>
								<Icons.Next
									aria-hidden="true"
									className="size-4 shrink-0 text-muted-foreground"
								/>
							</button>
						</li>
					)
				})}
			</ul>
		</>
	)
}

export { McpServersPanel, type McpServersPanelProps }
