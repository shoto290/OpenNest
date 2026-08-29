import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { BLANK_MCP_SECRETS } from "@workspace/ui/components/bot-settings"
import { McpServerSecrets } from "@workspace/ui/components/bot-settings-dialog/mcp-server-secrets"

const REFERENCES = ["ATLAS_TOKEN", "ATLAS_REGION"]

const meta = preview.meta({
	title: "Settings/Bot/McpServerSecrets",
	component: McpServerSecrets,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					// biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax a reader must type
					"Every key a server configuration asks for by name, and the one place a reader can answer. The configuration keeps a `${secret:KEY}` reference and never the value, so this panel is what stands between a placeholder and a server that starts: it says which keys are already answered without ever showing what they hold, takes a new value masked, and lets a stored one be replaced or cleared. It shows the keys the configuration names — nothing else — so a key that stops being referenced stops being asked for.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex w-[28rem] flex-col gap-3">
				<Story />
			</div>
		),
	],
	args: {
		references: REFERENCES,
		secrets: BLANK_MCP_SECRETS,
		onSecretSave: fn(),
		onSecretClear: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Two keys asked for, neither answered yet. Check that both read as not set, that saving is refused while nothing is typed, and that no value is on screen anywhere.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getAllByText("Not set")).toHaveLength(2)
		await expect(
			canvas.getAllByRole("button", { name: "Save" })[0],
		).toBeDisabled()
	},
})

export const Filled = meta.story({
	args: {
		secrets: { ...BLANK_MCP_SECRETS, filled: ["ATLAS_TOKEN"] },
	},
	parameters: {
		docs: {
			description: {
				story:
					"One key answered, one still open. Reach for this to check the two things a stored key must offer and the one thing it must never do: it can be replaced, it can be cleared, and it does not show what it holds.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Stored")).toBeVisible()
		await expect(canvas.getByRole("button", { name: "Clear" })).toBeVisible()
		await expect(canvas.getByRole("button", { name: "Replace" })).toBeVisible()
	},
})

export const Typed = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A value being typed. Check that the characters are masked as they arrive, that the reveal names the key it acts on, and that saving hands the typed value over, empties the field behind it and leaves the keyboard in it rather than nowhere.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.type(
			canvas.getByLabelText("ATLAS_TOKEN"),
			"sk-atlas-2f9c41d8",
		)

		await expect(canvas.getByLabelText("ATLAS_TOKEN")).toHaveAttribute(
			"type",
			"password",
		)

		await userEvent.click(
			canvas.getByRole("button", { name: "Show ATLAS_TOKEN" }),
		)

		await expect(canvas.getByLabelText("ATLAS_TOKEN")).toHaveAttribute(
			"type",
			"text",
		)

		await userEvent.click(canvas.getAllByRole("button", { name: "Save" })[0])

		await expect(args.onSecretSave).toHaveBeenCalledWith(
			"ATLAS_TOKEN",
			"sk-atlas-2f9c41d8",
		)
		await expect(canvas.getByLabelText("ATLAS_TOKEN")).toHaveValue("")
		await expect(canvas.getByLabelText("ATLAS_TOKEN")).toHaveFocus()
	},
})

export const Failed = meta.story({
	args: {
		secrets: {
			...BLANK_MCP_SECRETS,
			filled: ["ATLAS_TOKEN"],
			failures: { ATLAS_TOKEN: "save" as const },
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A write the store refused. Check that the failure is beside the key it belongs to and that the key keeps the state it had — a refused write changes nothing.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(
				"This value could not be stored, so the key is left as it was.",
			),
		).toBeVisible()
		await expect(canvas.getByText("Stored")).toBeVisible()
	},
})

export const Unavailable = meta.story({
	args: {
		secrets: { ...BLANK_MCP_SECRETS, isReady: false, filled: ["ATLAS_TOKEN"] },
	},
	parameters: {
		docs: {
			description: {
				story:
					"The secret store out of reach. Reach for this to check the panel refuses rather than pretends: every key reads as unavailable whatever the store last held, and nothing can be submitted.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getAllByText("Unavailable")).toHaveLength(2)
		await expect(
			canvas.getAllByRole("button", { name: "Save" })[0],
		).toBeDisabled()
	},
})

export const Empty = meta.story({
	args: { references: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A configuration naming no secret. It is the common case, so it says what to write to be asked for one rather than showing an empty list.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("No secret asked for")).toBeVisible()
	},
})
