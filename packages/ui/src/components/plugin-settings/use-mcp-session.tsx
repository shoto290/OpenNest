"use client"

import { type ReactNode, useState } from "react"

import {
	BLANK_MCP_SERVER_DRAFT,
	type BotMcpServerDraft,
	type BotMcpServerItem,
	isMcpServerDraftUnsaved,
	toMcpServerDraft,
} from "@workspace/ui/components/bot-settings"
import type { McpConnectionSection } from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import { McpServerEditor } from "@workspace/ui/components/bot-settings-dialog/mcp-server-editor"
import type { EnvironmentSection } from "@workspace/ui/components/environment-panel"
import {
	ApplicationsCatalogue,
	type ApplicationsCatalogueProps,
} from "@workspace/ui/components/plugin-settings/applications-catalogue"
import {
	type ApplicationsOwner,
	ApplicationsPanel,
} from "@workspace/ui/components/plugin-settings/applications-panel"

type ApplicationsCatalogueSection = Omit<
	ApplicationsCatalogueProps,
	"onBack" | "onPaste" | "className"
>

type McpSessionProps = {
	owner: ApplicationsOwner
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
	onServerConnect?: (server: BotMcpServerItem) => void
	serverConnection?: McpConnectionSection
	serverEnvironment?: EnvironmentSection
	catalogue?: ApplicationsCatalogueSection
}

type ApplicationsSection = Omit<McpSessionProps, "owner">

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
	mark?: string
	displayName?: string
}

const useMcpSession = ({
	owner,
	servers,
	haveFailedToLoad,
	onServerCreate,
	onServerChange,
	onServerDelete,
	onServerOpen,
	onServerConnect,
	serverConnection,
	serverEnvironment,
	catalogue,
}: McpSessionProps): McpSession => {
	const [session, setSession] = useState<OpenedServer | null>(null)
	const [isBrowsing, setBrowsing] = useState(false)

	const open = (opened: OpenedServer | null) => {
		setBrowsing(false)
		setSession(opened)
		onServerOpen?.(opened?.saved?.name ?? null)
	}

	const paste = () => open({ draft: BLANK_MCP_SERVER_DRAFT })

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

	const editorFor = (opened: OpenedServer) => {
		const { saved } = opened

		return (
			<McpServerEditor
				connection={serverConnection}
				displayName={opened.displayName}
				draft={opened.draft}
				environment={saved ? serverEnvironment : undefined}
				mark={opened.mark}
				onBack={() => open(null)}
				onDelete={saved ? () => remove(saved) : undefined}
				onDraftChange={(next) => setSession({ ...opened, draft: next })}
				onSave={(config) => save(opened, config)}
				saved={saved}
			/>
		)
	}

	const pushedPage = () => {
		if (session) return editorFor(session)

		if (isBrowsing && catalogue) {
			return (
				<ApplicationsCatalogue
					{...catalogue}
					onBack={() => setBrowsing(false)}
					onPaste={paste}
				/>
			)
		}

		return null
	}

	return {
		panel: (
			<ApplicationsPanel
				haveFailedToLoad={haveFailedToLoad}
				onAdd={catalogue ? () => setBrowsing(true) : paste}
				onConnect={onServerConnect}
				onOpen={(opened) =>
					open({
						draft: toMcpServerDraft(opened),
						saved: toMcpServerDraft(opened),
						mark: opened.mark,
						displayName: opened.displayName,
					})
				}
				onPaste={paste}
				owner={owner}
				servers={servers}
			/>
		),
		editor: pushedPage(),
		isOpen: session !== null || isBrowsing,
		isUnsaved: Boolean(
			session && isMcpServerDraftUnsaved(session.draft, session.saved),
		),
		discard: () => open(null),
	}
}

export {
	type ApplicationsCatalogueSection,
	type ApplicationsSection,
	type McpSession,
	type McpSessionProps,
	useMcpSession,
}
