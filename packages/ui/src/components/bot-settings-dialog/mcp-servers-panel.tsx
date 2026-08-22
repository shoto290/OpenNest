"use client"

import { useTranslation } from "react-i18next"

import type { BotMcpServerItem } from "@workspace/ui/components/bot-settings"
import { readMcpServerLaunch } from "@workspace/ui/components/bot-settings-dialog/mcp-server-launch"
import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"

type McpServersPanelProps = {
	servers: BotMcpServerItem[]
	/** Opens a server that exists. The editor takes the whole dialog, rail included,
	 * so it is the surface above that answers rather than this panel. */
	onOpen: (server: BotMcpServerItem) => void
	/** Opens the editor on a server nobody has written yet. */
	onAdd: () => void
}

/**
 * Every MCP server a bot declares: the name it connects as and the one line that
 * says what starting it means. The resting state of the servers group, and nothing
 * more — opening a row hands the whole dialog to that server, because a server is a
 * program somebody is about to run and it needs both the height and a summary of its
 * own.
 *
 * The panel keeps nothing: it lists what it is given and reports which row was
 * taken.
 */
const McpServersPanel = ({ servers, onOpen, onAdd }: McpServersPanelProps) => {
	const { t } = useTranslation("bots")

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
				<Button onClick={onAdd} size="sm">
					<Icons.Add aria-hidden="true" className="size-3.5" />
					{t("mcp.add")}
				</Button>
			</div>
		)
	}

	return (
		<>
			<div className="flex shrink-0 justify-end">
				<Button onClick={onAdd} size="sm" variant="outline">
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
								onClick={() => onOpen(server)}
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
