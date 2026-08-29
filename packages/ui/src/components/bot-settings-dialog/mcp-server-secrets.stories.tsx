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
		onVaultUnlock: fn(),
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

export const Unreadable = meta.story({
	args: {
		secrets: {
			...BLANK_MCP_SECRETS,
			filled: ["ATLAS_REGION"],
			unreadable: ["ATLAS_TOKEN"],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A key the index still names but whose value the store cannot read back — a vault opened with another passphrase, a keychain entry removed behind the app. Check it asks for a new value instead of claiming to hold one, and that only the key that really holds a value offers a way to clear it.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Needs a new value")).toBeVisible()
		await expect(canvas.getByText("Stored")).toBeVisible()
		await expect(canvas.getAllByRole("button", { name: "Clear" })).toHaveLength(
			1,
		)
	},
})

export const AskingForANewVaultPassphrase = meta.story({
	args: {
		secrets: { ...BLANK_MCP_SECRETS, isReady: false, needsPassphrase: true },
	},
	parameters: {
		docs: {
			description: {
				story:
					"No keychain answered on this machine and no vault has been written yet, so the panel asks for the passphrase that will create one. Check the per-key fields are gone while the vault is closed, and that the wording says a passphrase is being chosen rather than given back.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByLabelText("New passphrase")).toBeVisible()
		await expect(
			canvas.getByRole("button", { name: "Create the vault" }),
		).toBeVisible()
		await expect(canvas.queryByLabelText("ATLAS_TOKEN")).not.toBeInTheDocument()
	},
})

export const AskingToOpenAnExistingVault = meta.story({
	args: {
		secrets: {
			...BLANK_MCP_SECRETS,
			isReady: false,
			needsPassphrase: true,
			hasVault: true,
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The same gate over a vault that already exists. Reach for this to check the wording changes with it — the reader is opening something, not choosing a new passphrase — and that Enter submits the field it is typed in.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Passphrase"), "open sesame")
		await userEvent.keyboard("{Enter}")

		await expect(args.onVaultUnlock).toHaveBeenCalledWith("open sesame")
		await expect(
			canvas.getByRole("button", { name: "Open the vault" }),
		).toBeVisible()
	},
})

export const VaultPassphraseRejected = meta.story({
	args: {
		secrets: {
			...BLANK_MCP_SECRETS,
			isReady: false,
			needsPassphrase: true,
			hasVault: true,
			isPassphraseRejected: true,
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A passphrase the vault refused. Check the field stays where it is so the reader can try again, and that the refusal is said rather than left to a silent no-op.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(
				"That passphrase did not open the vault. Nothing was changed.",
			),
		).toBeVisible()
		await expect(canvas.getByLabelText("Passphrase")).toBeVisible()
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
