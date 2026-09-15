import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	FRAME_POLL,
} from "@workspace/storybook/story-utils"
import {
	BLANK_MCP_SERVER_DRAFT,
	type BotMcpServerDraft,
	toMcpServerConfigText,
	toMcpServerDraft,
} from "@workspace/ui/components/bot-settings"
import {
	McpServerEditor,
	type McpServerEditorProps,
} from "@workspace/ui/components/bot-settings-dialog/mcp-server-editor"
import {
	BOT_MCP_SERVERS,
	LONG_MCP_SERVER,
} from "@workspace/ui/components/bot-settings-dialog/mcp-servers.fixtures"
import { SERVER_ENVIRONMENT } from "@workspace/ui/components/environment.fixtures"

const [LOCAL, REMOTE] = BOT_MCP_SERVERS

const STARTED = toMcpServerDraft(LOCAL)

const REACHED = toMcpServerDraft(REMOTE)

const LONG = toMcpServerDraft(LONG_MCP_SERVER)

const UNREACHABLE: BotMcpServerDraft = {
	name: "ledger",
	transport: "remote",
	config: toMcpServerConfigText({ url: "https://ledger.internal/mcp" }),
}

const BROKEN: BotMcpServerDraft = {
	name: "atlas",
	transport: "local",
	config: '{\n  "command": "npx",\n  "args": ["-y",\n}',
}

const EditorHost = (props: McpServerEditorProps) => {
	const [draft, setDraft] = useState(props.draft)

	return (
		<McpServerEditor
			{...props}
			draft={draft}
			onDraftChange={(next) => {
				setDraft(next)
				props.onDraftChange(next)
			}}
		/>
	)
}

const meta = preview.meta({
	title: "Settings/Bot/McpServerEditor",
	component: McpServerEditor,
	parameters: {
		layout: "fullscreen",
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				component:
					"One MCP server of a companion's, whole, on the whole dialog: a rail of sections down the left and one section at a time on the right. The rail replaces the companion's own while a server is open — Connection, Environment, Advanced — so a reader sees what a server is made of rather than a name and a box of JSON. The fields and the JSON are two readings of one thing: a field answered is carried into the text, the text edited is carried back into the fields, and every key no field names is kept untouched, because the shape belongs to the transport. Which fields stand under Connection is the transport's own answer — a command and its arguments for a server started here, an address and its headers for one reached over the network. Nothing is written as it is typed: the save is a press, and the way out asks before it drops a draft. The destructive red on its own tint is the token's known contrast gap, flagged for review rather than worked around here.",
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
	render: (args) => <EditorHost {...args} />,
	args: {
		draft: STARTED,
		saved: STARTED,
		onDraftChange: fn(),
		onBack: fn(),
		onSave: fn(),
		onDelete: fn(),
	},
	argTypes: {
		defaultSection: { control: false },
		defaultConfirming: { control: false },
		defaultLeaving: { control: false },
	},
})

export const Connection = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A local server that already exists, opened on where it is reached from. Check that the notice says what a server is before a field is touched, that the command and its arguments are the shape a local server takes, and that answering one carries it into the JSON under Advanced — the save turns on the moment it does.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const save = canvas.getByRole("button", { name: "Save changes" })

		await expect(save).toBeDisabled()
		await expect(canvas.getByLabelText("Command")).toHaveValue("npx")

		await userEvent.clear(canvas.getByLabelText("Command"))
		await userEvent.type(canvas.getByLabelText("Command"), "bunx")

		await expect(save).toBeEnabled()
		await expect(canvas.getByText("Unsaved changes")).toBeVisible()

		await userEvent.click(save)
		await expect(args.onSave).toHaveBeenCalledWith({
			...LOCAL.config,
			command: "bunx",
		})
	},
})

export const RemoteConnection = meta.story({
	args: { draft: REACHED, saved: REACHED },
	parameters: {
		docs: {
			description: {
				story:
					"The same section for a server that is already running somewhere. Reach for this over `Connection` to check that the transport is what decides the fields: the address, the kind of endpoint it is reached on and its headers stand where the command and its arguments did. The endpoint is asked for rather than assumed — a remote server written without it is skipped by the runtime — and it is written beside the URL every time.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await expect(canvas.getByLabelText("URL")).toHaveValue(
			"https://ledger.internal/mcp",
		)
		await expect(canvas.queryByLabelText("Command")).not.toBeInTheDocument()
		await expect(
			canvas.getByRole("combobox", { name: "Endpoint" }),
		).toHaveTextContent("HTTP")

		await userEvent.click(canvas.getByRole("combobox", { name: "Endpoint" }))
		await userEvent.click(
			await screen.findByRole("option", { name: "Server-sent events" }),
		)

		await userEvent.type(
			canvas.getByLabelText("Headers"),
			"Authorization: Bearer token",
		)
		await userEvent.click(canvas.getByRole("tab", { name: "Advanced" }))
		await expect(canvas.getByLabelText("Configuration")).toHaveValue(
			toMcpServerConfigText({
				...REMOTE.config,
				type: "sse",
				headers: { Authorization: "Bearer token" },
			}),
		)
	},
})

export const RemoteWithoutEndpoint = meta.story({
	args: { draft: UNREACHABLE, saved: UNREACHABLE },
	parameters: {
		docs: {
			description: {
				story:
					"A remote server whose file names an address and nothing else — the shape the runtime skips, telling the reader to add a type. Reach for this to check the one case where a server that has not been touched still has something to save: the endpoint field stands on HTTP, the unsaved mark is up on open, and saving writes the type beside the URL rather than leaving the reader with a server that never connects.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("Unsaved changes")).toBeVisible()

		const save = canvas.getByRole("button", { name: "Save changes" })
		await expect(save).toBeEnabled()

		await userEvent.click(save)
		await expect(args.onSave).toHaveBeenCalledWith({
			url: "https://ledger.internal/mcp",
			type: "http",
		})
	},
})

export const Environment = meta.story({
	args: { defaultSection: "environment" },
	parameters: {
		docs: {
			description: {
				story:
					"What the server starts with, one name and value a line. This is where a token is pasted, so it is a section of its own rather than a field buried under the command. Check that a line typed here becomes a key of `env` in the JSON, and that a line cleared takes its key out rather than leaving an empty one behind.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const environment = canvas.getByRole("textbox", { name: "Secrets" })

		await expect(environment).toHaveValue(
			"ATLAS_TOKEN=sk-atlas-2f9c41d8e7b6a530\nATLAS_REGION=eu",
		)

		await userEvent.clear(environment)
		await userEvent.click(canvas.getByRole("tab", { name: "Advanced" }))
		await expect(canvas.getByLabelText("Configuration")).toHaveValue(
			toMcpServerConfigText({
				command: LOCAL.config.command,
				args: LOCAL.config.args,
			}),
		)
	},
})

export const ServerVariables = meta.story({
	args: {
		defaultSection: "environment",
		environment: {
			entries: SERVER_ENVIRONMENT,
			onSet: fn(),
			onDelete: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The two halves of the Environment section, together. The field above declares which names the server receives and carries its variable references; the list below holds the names this server owns, written once and never read back. A name defined here wins over the same name on the companion, which wins over the space, and every row says which scope actually serves it.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("textbox", { name: "Secrets" })).toBeVisible()
		await expect(canvas.getByText("LEDGER_KEY")).toBeVisible()
		await expect(canvas.getByText("SERVER_TIMEOUT_MS")).toBeVisible()
	},
})

export const Advanced = meta.story({
	args: { defaultSection: "advanced" },
	parameters: {
		docs: {
			description: {
				story:
					"The configuration itself, which is what is written and what every other section is a reading of. It is the only place a key no field names can be seen or changed. Check that editing the text here is carried back into the fields, and that the reading under it turns the shape into a sentence about this machine, with every environment value masked until it is asked for.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const config = canvas.getByLabelText("Configuration")

		await userEvent.clear(config)
		await userEvent.type(config, '{{"url": "https://atlas.dev/mcp"}')

		await userEvent.click(canvas.getByRole("tab", { name: "Connection" }))
		await expect(canvas.getByLabelText("URL")).toHaveValue(
			"https://atlas.dev/mcp",
		)
	},
})

export const Empty = meta.story({
	args: {
		draft: BLANK_MCP_SERVER_DRAFT,
		saved: undefined,
		onDelete: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A server that does not exist yet. Reach for this over `Connection` to review what a reader is asked for before anything is written: the same notice, because trust is asked for while the server is being added rather than after, no delete, because there is nothing on the disk to take away, and no unsaved mark, because there is nothing kept to differ from. The button stays out of reach until the server is named.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const create = canvas.getByRole("button", { name: "Add application" })

		await expect(create).toBeDisabled()
		await userEvent.type(canvas.getByLabelText("Name"), "Atlas Docs")
		await expect(canvas.getByLabelText("Name")).toHaveValue("atlas-docs")

		await userEvent.type(canvas.getByLabelText("Command"), "npx")
		await userEvent.click(create)
		await expect(args.onSave).toHaveBeenCalledWith({ command: "npx" })
	},
})

export const Invalid = meta.story({
	args: { draft: BROKEN, defaultSection: "advanced" },
	parameters: {
		docs: {
			description: {
				story:
					"A configuration the reader is halfway through. This is the state the raw field owes them: the message under the box says what is wrong and that nothing is saved, the edge turns without recolouring what they typed, and the reading disappears rather than showing a stale command. The save is out of reach until it parses, and the two sections read out of the configuration say so rather than showing fields that would drop what was typed.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await expect(
			canvas.getByRole("button", { name: "Save changes" }),
		).toBeDisabled()
		await expect(canvas.getByLabelText("Configuration")).toBeInvalid()
		await expect(
			canvas.queryByRole("heading", { name: "What this starts" }),
		).not.toBeInTheDocument()

		await userEvent.click(canvas.getByRole("tab", { name: "Connection" }))
		await expect(canvas.queryByLabelText("Command")).not.toBeInTheDocument()
	},
})

export const LongContent = meta.story({
	args: { draft: LONG, saved: LONG },
	parameters: {
		docs: {
			description: {
				story:
					"A server whose name, command and arguments all run past their fields. Check that only the open section scrolls, that the rail and the header hold still, and that the name in the header truncates rather than pushing the save off the row.",
			},
		},
	},
})

export const IconRail = meta.story({
	decorators: [
		(Story) => (
			<div className="flex h-[34rem] w-[30rem] overflow-hidden rounded-2xl border border-border">
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"The editor on a surface too narrow for the rail's names — below 42rem, the same threshold the companion's own rail takes. Check that every section stays reachable and named to a screen reader, and that the way out keeps its name as a tooltip rather than losing it.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await waitFor(
			() => expect(canvas.getByText("All applications")).toHaveClass("sr-only"),
			FRAME_POLL,
		)

		await userEvent.hover(
			canvas.getByRole("button", { name: "All applications" }),
		)
		await expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"All applications",
		)
	},
})

export const WithLeaving = meta.story({
	args: { defaultLeaving: true },
	parameters: {
		docs: {
			description: {
				story:
					"The way out taken while something is unsaved, mounted with its question already up. It says what goes and what is left as it was before anything is dropped. Check that cancelling leaves the draft exactly as it was and reports nothing, and that accepting fires `onBack` once. A draft with nothing to save goes straight back without asking.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await screen.findByRole("alertdialog")
		await waitFor(() => expect(popup).toBeVisible())

		await userEvent.click(within(popup).getByRole("button", { name: "Leave" }))

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onBack).toHaveBeenCalledTimes(1)
	},
})

export const WithConfirmation = meta.story({
	args: { defaultConfirming: true },
	parameters: {
		docs: {
			description: {
				story:
					"The delete, mounted with its question already up. It names the server so somebody who opened the wrong one finds out here, states what goes with it, and Cancel comes first. Check that accepting fires `onDelete` once.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await screen.findByRole("alertdialog")
		await waitFor(() => expect(popup).toBeVisible())

		await expect(popup).toHaveTextContent(`Remove ${LOCAL.name}?`)
		await userEvent.click(
			within(popup).getByRole("button", { name: "Remove application" }),
		)

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onDelete).toHaveBeenCalledTimes(1)
	},
})

export const NeedsAuthorization = meta.story({
	args: { connection: { state: "needsAuthorization", onConnect: fn() } },
	parameters: {
		docs: {
			description: {
				story:
					"A saved connector that signs in through the browser and has not been authorized yet. Reach for this to check the block the Connection section opens on: it stands above the trust notice, says where the token is kept — with the connector's secrets, never in the JSON under Advanced — and offers the one action that can be taken. Check that the state is readable from the title and the dot together, not from the amber field.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(
			canvas.getByText("Needs authorization", { selector: "p" }),
		).toBeVisible()

		await userEvent.click(canvas.getByRole("button", { name: "Connect" }))

		await expect(args.connection?.onConnect).toHaveBeenCalledTimes(1)
	},
})

export const Connecting = meta.story({
	args: {
		connection: {
			state: "connecting",
			host: "atlas.dev",
			onCancel: fn(),
			onReopen: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The block while the reader is somewhere else — in the browser tab the connector opened. Reach for this over `NeedsAuthorization` to check the waiting state: the title names what is being waited on rather than repeating the state label, the spinner replaces the dot and holds still under reduced motion, and both ways out are offered, because a tab that was closed by accident should not need a cancel first.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("Waiting for your browser")).toBeVisible()

		await userEvent.click(
			canvas.getByRole("button", { name: "Open the page again" }),
		)
		await expect(args.connection?.onReopen).toHaveBeenCalledTimes(1)

		await userEvent.click(canvas.getByRole("button", { name: "Cancel" }))
		await expect(args.connection?.onCancel).toHaveBeenCalledTimes(1)
	},
})

export const Connected = meta.story({
	args: {
		connection: {
			state: "connected",
			authorizedAt: "4 March 2026",
			onDisconnect: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"An authorized connector at rest. Check that the block goes quiet — the muted field, no amber, no red — and that it still says the two things the reader came for: when it was authorized and that the token renews itself. Disconnect is the only action, and it asks before it drops anything: `WithDisconnection` mounts that question.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Connected", { selector: "p" })).toBeVisible()
		await expect(
			canvas.getByRole("button", { name: "Disconnect" }),
		).toBeVisible()
	},
})

export const ConnectionFailed = meta.story({
	args: { connection: { state: "failed", onConnect: fn() } },
	parameters: {
		docs: {
			description: {
				story:
					"The attempt came back refused. Reach for this to check the one block with no sentence under its title: nothing true can be said about why until the connector says it, so the block states the outcome and offers another attempt rather than guessing at a cause. Check that the red is the field and the dot, never the words.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("Couldn’t connect")).toBeVisible()

		await userEvent.click(canvas.getByRole("button", { name: "Retry" }))

		await expect(args.connection?.onConnect).toHaveBeenCalledTimes(1)
	},
})

export const UnsavedConnection = meta.story({
	args: {
		draft: BLANK_MCP_SERVER_DRAFT,
		saved: undefined,
		onDelete: undefined,
		connection: { state: "needsAuthorization", onConnect: fn() },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A connector being added, before anything is on the disk. Reach for this over `NeedsAuthorization` to check what the block does when authorizing cannot mean anything yet: the field goes muted rather than asking for attention, the sentence says what has to happen first, and Connect is present but out of reach so the order of operations is readable rather than discovered by a press that fails.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("Available once this application is saved."),
		).toBeVisible()
		await expect(canvas.getByRole("button", { name: "Connect" })).toBeDisabled()
	},
})

export const WithDisconnection = meta.story({
	args: {
		connection: {
			state: "connected",
			authorizedAt: "4 March 2026",
			onDisconnect: fn(),
		},
		defaultDisconnecting: true,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Disconnect taken, with its question already up. Reach for this to check that it is a different question from `WithConfirmation`: removing a connector takes its configuration off the disk, disconnecting only drops the token and the tools it opened. Both name the connector and both put Cancel first. Check that accepting fires `onDisconnect` once.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await screen.findByRole("alertdialog")
		await waitFor(() => expect(popup).toBeVisible())

		await expect(popup).toHaveTextContent(`Disconnect ${LOCAL.name}?`)
		await userEvent.click(
			within(popup).getByRole("button", { name: "Disconnect" }),
		)

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.connection?.onDisconnect).toHaveBeenCalledTimes(1)
	},
})
