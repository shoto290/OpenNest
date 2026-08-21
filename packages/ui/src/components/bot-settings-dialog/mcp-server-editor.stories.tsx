import { useState } from "react"
import { expect, fn, screen, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import {
	type BotMcpServerDraft,
	toMcpServerConfigText,
} from "@workspace/ui/components/bot-settings"
import {
	McpServerEditor,
	type McpServerEditorProps,
} from "@workspace/ui/components/bot-settings-dialog/mcp-server-editor"
import { BOT_MCP_SERVERS } from "@workspace/ui/components/bot-settings-dialog/mcp-servers.fixtures"

const [LOCAL] = BOT_MCP_SERVERS

const WRITTEN: BotMcpServerDraft = {
	name: LOCAL.name,
	config: toMcpServerConfigText(LOCAL.config),
}

const BLANK: BotMcpServerDraft = { name: "", config: "{}" }

const BROKEN: BotMcpServerDraft = {
	name: "atlas",
	config: '{\n  "command": "npx",\n  "args": ["-y",\n}',
}

/** The editor keeps no draft of its own, so a story that lets a reader type holds
 * it. */
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
	title: "AI/McpServerEditor",
	component: McpServerEditor,
	parameters: {
		layout: "fullscreen",
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				component:
					"One MCP server, whole: what it is declared under, what starting it means, and the configuration itself. The configuration is raw JSON on purpose — a server's shape belongs to its transport, so a form of three fields would be a lie the day a remote server arrives — and what a form would have given for free is given back around it: a notice saying this starts a program on the reader's own machine, and a reading of what will run under the field. Nothing is written as it is typed, unlike a skill: the name is the key the server is filed under, so a rename typed letter by letter would file one server per keystroke, and a half-written configuration is not JSON at all. The save is a press, and it stays out of reach until the name is filled and the JSON parses. The destructive red on its own tint is the token's known contrast gap, flagged for review rather than worked around here.",
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
	render: (args) => <EditorHost {...args} />,
	args: {
		draft: WRITTEN,
		onDraftChange: fn(),
		onBack: fn(),
		onSave: fn(),
		onDelete: fn(),
	},
	argTypes: {
		// Read once, as the editor mounts, so it is a story's arg rather than a knob.
		defaultConfirming: { control: false },
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A server that already exists. Check the order the panel is read in: the notice says what a server is before a field is touched, the configuration is the raw shape the transport asked for, and the reading under it turns that shape back into a sentence about this machine. Saving reports the parsed configuration, never the text.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Save changes" }))

		await expect(args.onSave).toHaveBeenCalledWith(LOCAL.config)
	},
})

export const Empty = meta.story({
	args: { draft: BLANK, onDelete: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A server that does not exist yet. Reach for this over `Default` to review what a reader is asked for before anything is written: the same notice, because trust is asked for while the server is being added rather than after, and no delete, because there is nothing on the disk to take away. The button stays disabled until the server is named — an empty object parses, so the name is the only thing missing.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const create = canvas.getByRole("button", { name: "Add server" })

		await expect(create).toBeDisabled()
		await userEvent.type(canvas.getByLabelText("Name"), "Atlas Docs")
		await expect(create).toBeEnabled()

		await userEvent.click(create)
		await expect(args.onSave).toHaveBeenCalledWith({})
	},
})

export const Invalid = meta.story({
	args: { draft: BROKEN },
	parameters: {
		docs: {
			description: {
				story:
					"A configuration the reader is halfway through. This is the state the raw field owes them: the message under the box says what is wrong and that nothing is saved, the edge turns without recolouring what they typed, and the reading disappears rather than showing a stale command. The save is out of reach until it parses, so a broken configuration cannot reach the disk.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("button", { name: "Save changes" }),
		).toBeDisabled()
		await expect(canvas.getByLabelText("Configuration")).toBeInvalid()
		await expect(
			canvas.queryByRole("heading", { name: "What this starts" }),
		).not.toBeInTheDocument()
	},
})

export const Deleting = meta.story({
	args: { defaultConfirming: true },
	parameters: {
		docs: {
			description: {
				story:
					"The question that stands between a reader and a removed server, mounted already up. It names the server so somebody who opened the wrong one finds out here, and Cancel comes first.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		await waitFor(() =>
			expect(screen.getByText("Remove atlas?")).toBeInTheDocument(),
		)

		await userEvent.click(screen.getByRole("button", { name: "Remove server" }))
		await expect(args.onDelete).toHaveBeenCalledTimes(1)
	},
})
