import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import {
	BOT_MCP_SERVERS,
	LONG_MCP_SERVER,
} from "@workspace/ui/components/bot-settings-dialog/mcp-servers.fixtures"
import {
	McpServersPanel,
	type McpServersPanelProps,
} from "@workspace/ui/components/bot-settings-dialog/mcp-servers-panel"

const [LOCAL] = BOT_MCP_SERVERS

/** The panel keeps no server of its own, so a story that lets a reader write holds
 * the bundle the writing produces — the way the app's own store does. */
const PanelHost = (props: McpServersPanelProps) => {
	const [servers, setServers] = useState(props.servers)

	return (
		<McpServersPanel
			{...props}
			onChange={(openedName, name, config) => {
				setServers(
					servers.map((server) =>
						server.name === openedName ? { name, config } : server,
					),
				)
				props.onChange(openedName, name, config)
			}}
			onCreate={(name, config) => {
				setServers([...servers, { name, config }])
				props.onCreate(name, config)
			}}
			onDelete={(name) => {
				setServers(servers.filter((server) => server.name !== name))
				props.onDelete(name)
			}}
			servers={servers}
		/>
	)
}

const meta = preview.meta({
	title: "AI/McpServersPanel",
	component: McpServersPanel,
	parameters: {
		layout: "fullscreen",
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				component:
					"Every MCP server a bot declares, and the one being written. The list is the resting state — the name the bot connects as and the one line that says what starting it means — and opening a row hands the whole panel to that server, because a configuration is JSON somebody reads line by line. The panel holds only which server is open and the draft: everything else is reported to the surface, which owns the writing. Every call carries the name the editor was opened on, because the name is the key the server is filed under, so a rename is a move rather than a second server. The destructive red on its own tint is the token's known contrast gap, flagged for review rather than worked around here.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex h-[34rem] w-[36rem] flex-col gap-4 overflow-y-auto p-5">
				<Story />
			</div>
		),
	],
	render: (args) => <PanelHost {...args} />,
	args: {
		servers: BOT_MCP_SERVERS,
		onCreate: fn(),
		onChange: fn(),
		onDelete: fn(),
	},
	argTypes: {
		// Read once, as the panel mounts, so they are a story's args rather than knobs.
		defaultOpenServerName: { control: false },
		defaultAdding: { control: false },
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A bot declaring all three kinds at once. Check that each row says what starting it means in one line — a command, a URL, or plainly nothing — which is the whole of what the list has to answer at a glance, and that the row whose configuration names neither keeps the same height as the others.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /atlas/ }))

		await expect(canvas.getByLabelText("Name")).toHaveValue(LOCAL.name)
	},
})

export const Empty = meta.story({
	args: { servers: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A bot nobody has given a server. Reach for this over `Default` to check the one state that has to both say so and offer a way out of it: the sentence says what an MCP server is and what adding one lets the bot do, before asking for one.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Add server" }))

		await expect(canvas.getByLabelText("Name")).toHaveValue("")
	},
})

export const LongContent = meta.story({
	args: { servers: [LONG_MCP_SERVER, ...BOT_MCP_SERVERS] },
	parameters: {
		docs: {
			description: {
				story:
					"A server whose name and command both run past the row. Check that each truncates on its own line rather than wrapping the row taller, and that the chevron holds its place at the end whatever the command does.",
			},
		},
	},
})

export const WithNewServer = meta.story({
	args: { defaultAdding: true },
	parameters: {
		docs: {
			description: {
				story:
					"The panel mounted straight on the blank editor, which is where the add button lands. The configuration opens on the two keys a local server always has, so the reader answers a shape rather than an empty box. Saving reports the name and the parsed configuration once and returns to the list, where the new row already reads back the command it will run.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Name"), "Atlas Docs")
		await userEvent.click(canvas.getByRole("button", { name: "Add server" }))

		await expect(args.onCreate).toHaveBeenCalledWith("atlas-docs", {
			command: "",
			args: [],
		})
		await expect(
			canvas.getByRole("button", { name: /atlas-docs/ }),
		).toBeVisible()
	},
})

export const WithRenamedServer = meta.story({
	args: { defaultOpenServerName: "ledger" },
	parameters: {
		docs: {
			description: {
				story:
					"The panel mounted on a server whose name the reader then changes. Reach for this to check the one call a name can get wrong: the change is reported against the name the editor was opened on, so the server moves instead of a second one appearing beside it.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.clear(canvas.getByLabelText("Name"))
		await userEvent.type(canvas.getByLabelText("Name"), "books")
		await userEvent.click(canvas.getByRole("button", { name: "Save changes" }))

		await expect(args.onChange).toHaveBeenCalledWith("ledger", "books", {
			type: "http",
			url: "https://ledger.internal/mcp",
		})
		await expect(canvas.getAllByRole("listitem")).toHaveLength(3)
		await expect(canvas.getByRole("button", { name: /books/ })).toBeVisible()
	},
})
