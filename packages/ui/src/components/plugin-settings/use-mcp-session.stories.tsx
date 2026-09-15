import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import type { BotMcpServerItem } from "@workspace/ui/components/bot-settings"
import { BOT_MCP_SERVERS } from "@workspace/ui/components/bot-settings-dialog/mcp-servers.fixtures"
import {
	CATALOGUE_CATEGORIES,
	CURATED_APPLICATIONS,
} from "@workspace/ui/components/plugin-settings/applications.fixtures"
import type { ApplicationsOwner } from "@workspace/ui/components/plugin-settings/applications-panel"
import {
	type McpSessionProps,
	useMcpSession,
} from "@workspace/ui/components/plugin-settings/use-mcp-session"

const [LOCAL, REMOTE] = BOT_MCP_SERVERS

const COMPANION = {
	kind: "companion",
	name: "Repository archivist",
} satisfies ApplicationsOwner

const NEEDS_AUTHORIZATION = {
	...LOCAL,
	connection: "needsAuthorization",
} satisfies BotMcpServerItem

const McpSessionScreen = (props: McpSessionProps) => {
	const session = useMcpSession(props)

	if (session.isOpen) return session.editor

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
			{session.panel}
		</div>
	)
}

const meta = preview.meta({
	title: "Settings/Plugins/McpSession",
	component: McpSessionScreen,
	parameters: {
		layout: "fullscreen",
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				component:
					"The list and the editor as one composition: which server is open is the session's own state, and everything else is handed to it. The connection is two inputs rather than one, because they answer at different moments — every row reads its own state off the server it is given, while the editor block is handed the connection of whichever server is open, resolved by the caller from `onServerOpen`.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex h-[34rem] w-[52rem] overflow-hidden rounded-2xl border border-border">
				<Story />
			</div>
		),
	],
	args: {
		owner: COMPANION,
		servers: BOT_MCP_SERVERS,
		onServerCreate: fn(),
		onServerChange: fn(),
		onServerDelete: fn(),
		onServerOpen: fn(),
	},
})

export const AddingPushesTheCatalogue = meta.story({
	args: {
		catalogue: {
			categories: CATALOGUE_CATEGORIES,
			category: "everything",
			onCategoryChange: fn(),
			query: "",
			onQueryChange: fn(),
			curated: CURATED_APPLICATIONS,
			registry: [],
			onRegistryRetry: fn(),
			onPick: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"Add application with a catalogue handed in. Check that the catalogue replaces the whole body, rail included, that All applications brings the list back, and that Paste a configuration opens a blank editor the way Add did before a catalogue existed.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Add application" }),
		)
		await userEvent.click(
			canvas.getByRole("button", { name: "All applications" }),
		)
		await expect(
			canvas.getByRole("button", { name: "Open atlas" }),
		).toBeVisible()

		await userEvent.click(
			canvas.getByRole("button", { name: "Add application" }),
		)
		await userEvent.click(
			canvas.getByRole("button", { name: "Paste a configuration" }),
		)
		await expect(canvas.getByRole("tab", { name: "Connection" })).toBeVisible()
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The composition with no connection input at all, which is what every caller passes until one is wired. Check that the list and the editor render exactly as they did before connectors had states: no lane content, no action, no block above the trust notice.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Open atlas" }))

		await expect(args.onServerOpen).toHaveBeenCalledWith("atlas")
		await expect(
			canvas.queryByRole("button", { name: "Connect" }),
		).not.toBeInTheDocument()
	},
})

export const NeedsAuthorization = meta.story({
	args: {
		servers: [NEEDS_AUTHORIZATION, REMOTE],
		onServerConnect: fn(),
		serverConnection: { state: "needsAuthorization", onConnect: fn() },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A connector waiting to be authorized, seen through the composition rather than through either component alone. Reach for this to check that one state reaches two surfaces by two paths: the row draws its lane and its Connect from the server it was given, and opening that row hands the editor the block with the same state. Check that connecting from the row does not open the connector, and that the block's own Connect is a separate press.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Connect atlas" }))

		await expect(args.onServerConnect).toHaveBeenCalledWith(NEEDS_AUTHORIZATION)
		await expect(args.onServerOpen).not.toHaveBeenCalled()

		await userEvent.click(canvas.getByRole("button", { name: "Open atlas" }))

		await expect(
			canvas.getByText("Needs authorization", { selector: "p" }),
		).toBeVisible()

		await userEvent.click(canvas.getByRole("button", { name: "Connect" }))

		await expect(args.serverConnection?.onConnect).toHaveBeenCalledTimes(1)
	},
})
