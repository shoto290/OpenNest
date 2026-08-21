import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { McpServerLaunch } from "@workspace/ui/components/bot-settings-dialog/mcp-server-launch"
import {
	BOT_MCP_SERVERS,
	LONG_MCP_SERVER,
} from "@workspace/ui/components/bot-settings-dialog/mcp-servers.fixtures"

const [LOCAL, REMOTE, UNKNOWN] = BOT_MCP_SERVERS

const meta = preview.meta({
	title: "AI/McpServerLaunch",
	component: McpServerLaunch,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"What a raw MCP configuration actually means, in the two terms a reader can act on: the command line that will run on their machine, or the address that will be reached, and the environment it carries. It exists because the configuration beside it is edited as JSON — the shape belongs to the transport, so a form of fixed fields would refuse the next kind of server the day it arrives — and this is what gives back what a form would have given for free. It recognises rather than validates: a key it does not know is left alone. Every environment value is masked, one reveal per variable, because an environment is where a token is pasted and this panel opens over whatever screen is being shared.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="w-[28rem]">
				<Story />
			</div>
		),
	],
	args: { config: LOCAL.config },
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A local server: a command, its arguments and an environment holding a token. Check that the command and its arguments read as one line the way a shell would show them, and that both values start masked — the reveal is per variable, so showing the region never shows the token.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText(/npx -y @atlas\/mcp-server/)).toBeVisible()
		await expect(canvas.queryByText(/sk-atlas/)).not.toBeInTheDocument()
	},
})

export const WithRevealedValue = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"One variable asked for. Reach for this to check the only state where a secret is on screen: the button that showed it turns into the one that hides it again, it names the variable it acts on so a screen reader hears which, and the variable beside it stays masked.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Show the value of ATLAS_TOKEN" }),
		)

		await expect(canvas.getByText(/sk-atlas/)).toBeVisible()
		await expect(
			canvas.getByRole("button", { name: "Hide the value of ATLAS_TOKEN" }),
		).toBeVisible()
		await expect(
			canvas.getByRole("button", { name: "Show the value of ATLAS_REGION" }),
		).toBeVisible()
	},
})

export const Remote = meta.story({
	args: { config: REMOTE.config },
	parameters: {
		docs: {
			description: {
				story:
					"A server reached over the network instead of started. It is why the configuration is not a form: nothing here names a command, and the reading says what it does name rather than showing empty fields.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("https://ledger.internal/mcp")).toBeVisible()
	},
})

export const Unrecognised = meta.story({
	args: { config: UNKNOWN.config },
	parameters: {
		docs: {
			description: {
				story:
					"A configuration holding keys this side does not know. It says so plainly rather than pretending the server is fine — a reader who sees this has not written the command yet — and it still refuses nothing: the configuration is theirs to save.",
			},
		},
	},
})

export const LongContent = meta.story({
	args: { config: LONG_MCP_SERVER.config },
	parameters: {
		docs: {
			description: {
				story:
					"A command with a path, six arguments and a long token in the environment. Check that the command line wraps rather than being cut — a reader has to see all of what will run — while an environment value truncates on one line, since the reveal is what it is read from.",
			},
		},
	},
})
