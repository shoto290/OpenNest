import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	BOT_MCP_SERVERS,
	LONG_MCP_SERVER,
} from "@workspace/ui/components/bot-settings-dialog/mcp-servers.fixtures"
import { McpServersPanel } from "@workspace/ui/components/bot-settings-dialog/mcp-servers-panel"

const [LOCAL] = BOT_MCP_SERVERS

const meta = preview.meta({
	title: "AI/McpServersPanel",
	component: McpServersPanel,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"Every MCP server a bot declares: the name it connects as and the one line that says what starting it means — a command, a URL, or plainly nothing. This is the resting state and the whole of it — taking a row hands the entire dialog to that server, rail included, because a server is a program somebody is about to run on their own machine and it needs both the height and a summary of its own. The panel keeps nothing: it lists what it is given and reports which row was taken.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex h-[28rem] w-[36rem] flex-col gap-4 p-5">
				<Story />
			</div>
		),
	],
	args: {
		servers: BOT_MCP_SERVERS,
		onOpen: fn(),
		onAdd: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A bot declaring all three kinds at once. Check that each row says what starting it means in one line — which is the whole of what the list has to answer at a glance — and that the row whose configuration names neither keeps the same height as the others. Taking a row reports the server itself, never its name.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /atlas/ }))

		await expect(args.onOpen).toHaveBeenCalledWith(LOCAL)
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
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Add server" }))

		await expect(args.onAdd).toHaveBeenCalledTimes(1)
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
