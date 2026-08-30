"use client"

import { type ReactNode, useState } from "react"

import {
	BLANK_MCP_SERVER_DRAFT,
	type BotMcpServerDraft,
	type BotMcpServerItem,
	isMcpServerDraftUnsaved,
	toMcpServerDraft,
} from "@workspace/ui/components/bot-settings"
import { McpServerEditor } from "@workspace/ui/components/bot-settings-dialog/mcp-server-editor"
import { McpServersPanel } from "@workspace/ui/components/bot-settings-dialog/mcp-servers-panel"
import type { EnvironmentSection } from "@workspace/ui/components/environment-panel"

type McpSessionProps = {
	servers: BotMcpServerItem[]
	haveFailedToLoad?: boolean
	onServerCreate: (name: string, config: Record<string, unknown>) => void
	onServerChange: (
		openedName: string,
		name: string,
		config: Record<string, unknown>,
	) => void
	onServerDelete: (name: string) => void
	onServerOpen?: (name: string | null) => void
	serverEnvironment?: EnvironmentSection
}

type McpSession = {
	panel: ReactNode
	editor: ReactNode
	isOpen: boolean
	isUnsaved: boolean
	discard: () => void
}

type OpenedServer = {
	draft: BotMcpServerDraft
	saved?: BotMcpServerDraft
}

const useMcpSession = ({
	servers,
	haveFailedToLoad,
	onServerCreate,
	onServerChange,
	onServerDelete,
	onServerOpen,
	serverEnvironment,
}: McpSessionProps): McpSession => {
	const [session, setSession] = useState<OpenedServer | null>(null)

	const open = (opened: OpenedServer | null) => {
		setSession(opened)
		onServerOpen?.(opened?.saved?.name ?? null)
	}

	const save = (
		{ draft, saved }: OpenedServer,
		config: Record<string, unknown>,
	) => {
		if (saved) {
			onServerChange(saved.name, draft.name, config)
		} else {
			onServerCreate(draft.name, config)
		}

		open(null)
	}

	const remove = (saved: BotMcpServerDraft) => {
		onServerDelete(saved.name)
		open(null)
	}

	const editorFor = ({ draft, saved }: OpenedServer) => (
		<McpServerEditor
			draft={draft}
			environment={saved ? serverEnvironment : undefined}
			onBack={() => open(null)}
			onDelete={saved ? () => remove(saved) : undefined}
			onDraftChange={(next) => setSession({ draft: next, saved })}
			onSave={(config) => save({ draft, saved }, config)}
			saved={saved}
		/>
	)

	return {
		panel: (
			<McpServersPanel
				haveFailedToLoad={haveFailedToLoad}
				onAdd={() => open({ draft: BLANK_MCP_SERVER_DRAFT })}
				onOpen={(opened) =>
					open({
						draft: toMcpServerDraft(opened),
						saved: toMcpServerDraft(opened),
					})
				}
				servers={servers}
			/>
		),
		editor: session ? editorFor(session) : null,
		isOpen: session !== null,
		isUnsaved: Boolean(
			session && isMcpServerDraftUnsaved(session.draft, session.saved),
		),
		discard: () => open(null),
	}
}

export { type McpSession, type McpSessionProps, useMcpSession }
