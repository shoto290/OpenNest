import { expect, fn, screen, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	BLANK_SECRETS,
	type SecretEntry,
} from "@workspace/ui/components/secrets-settings/secrets"
import { SecretsPanel } from "@workspace/ui/components/secrets-settings/secrets-panel"

const readable = (scope: "space" | "bot" | "server") => ({
	scope,
	readable: true,
})

const heldBy = (
	key: string,
	scopes: ("space" | "bot" | "server")[],
): SecretEntry => ({
	key,
	owners: scopes.map(readable),
	servedBy: readable(scopes[scopes.length - 1] ?? "bot"),
})

const meta = preview.meta({
	title: "Settings/Secrets/SecretsPanel",
	component: SecretsPanel,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One line a key, the way GitHub and Vercel list theirs, wherever the reader opens it from: a space, a bot, or a single MCP server. Only the owner behind the panel changes, and what a space answers serves every bot in it, what a bot answers serves every server it starts, and a server's own value wins over both. That whole hierarchy is said in tags rather than sentences, because a reader scanning twelve keys for the one that is missing cannot read twelve paragraphs. The value is never rendered: a row shows a key, its state, where it comes from, and the two things that can be done to it.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex w-[30rem] flex-col gap-3">
				<Story />
			</div>
		),
	],
	args: {
		value: BLANK_SECRETS,
		onSave: fn(),
		onDelete: fn(),
		onVaultUnlock: fn(),
	},
})

export const Empty = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A bot answering nothing yet: one line to add a key, one sentence saying there are none. Check that naming a key alone is not enough to submit, since a key with no value stores nothing.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await expect(canvas.getByRole("button", { name: "Add" })).toBeDisabled()

		await userEvent.type(canvas.getByLabelText("Key"), "ANTHROPIC_API_KEY")
		await expect(canvas.getByRole("button", { name: "Add" })).toBeDisabled()
	},
})

export const DeclaredByHand = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A key named and answered on the one line at the top, with nothing referencing it yet. This is what makes the panel usable before any MCP server exists. Check the value is masked as it is typed and that both fields empty once it is stored.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Key"), "ANTHROPIC_API_KEY")
		await userEvent.type(canvas.getByLabelText("Value"), "sk-ant-atlas")

		await expect(canvas.getByLabelText("Value")).toHaveAttribute(
			"type",
			"password",
		)

		await userEvent.click(canvas.getByRole("button", { name: "Add" }))

		await expect(args.onSave).toHaveBeenCalledWith(
			"ANTHROPIC_API_KEY",
			"sk-ant-atlas",
		)
		await expect(canvas.getByLabelText("Key")).toHaveValue("")
	},
})

export const AskedForByAServer = meta.story({
	args: { references: ["ATLAS_TOKEN"] },
	parameters: {
		docs: {
			description: {
				story:
					"A key an MCP configuration references and nothing answers. It is listed without being stored, marked as not set, so the reader finds it here instead of discovering it when the server fails to start.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Not set")).toBeVisible()
		await expect(canvas.getByText("ATLAS_TOKEN")).toBeVisible()
	},
})

export const ServedByTheSpace = meta.story({
	args: {
		value: {
			...BLANK_SECRETS,
			scope: "bot",
			entries: [heldBy("SHARED", ["space"]), heldBy("OWN", ["space", "bot"])],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A bot panel over two keys: one the space answers for it, one the bot answers itself over the space's. Reach for this to check the two read apart at a glance, from tags rather than sentences, and that only the value this bot owns deletes in one click.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("From space")).toBeVisible()
		await expect(canvas.getByText("Overrides space")).toBeVisible()
		await expect(
			canvas.getByRole("button", { name: "Delete OWN" }),
		).toBeVisible()
		await expect(
			canvas.getByRole("button", { name: "Delete from the space" }),
		).toBeVisible()
	},
})

export const ServerValueWinsOverBoth = meta.story({
	args: {
		value: {
			...BLANK_SECRETS,
			scope: "server",
			entries: [heldBy("SHARED", ["space", "bot", "server"])],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The narrowest panel there is, over a key all three owners answer. The server's own value is the one that starts it, and one tag says which value it displaces rather than listing all three.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Overrides bot")).toBeVisible()
		await expect(canvas.getByText("Stored")).toBeVisible()
	},
})

export const DeletingAWiderValue = meta.story({
	args: {
		value: {
			...BLANK_SECRETS,
			scope: "bot",
			entries: [heldBy("SHARED", ["space"])],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The one act in this panel that reaches past what the reader opened. Deleting a value the space owns takes the key from every bot in it, so the control names the owner and asks first. Check nothing is deleted until the question is answered.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Delete from the space" }),
		)
		await expect(args.onDelete).not.toHaveBeenCalled()

		const question = await screen.findByRole("alertdialog", {
			name: "Delete SHARED?",
		})

		await userEvent.click(
			within(question).getByRole("button", { name: "Delete from the space" }),
		)

		await expect(args.onDelete).toHaveBeenCalledWith("SHARED", "space")
	},
})

export const AfterAWriteAndATakeover = meta.story({
	args: {
		value: {
			...BLANK_SECRETS,
			scope: "bot",
			entries: [heldBy("SAVED", ["bot"]), heldBy("GONE", ["space"])],
			saved: { SAVED: "bot" },
			tookOver: { GONE: "space" },
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"What the panel says after it acts, without growing a line: the key just written reads Saved, and the key whose own value was deleted falls back to the space and says so where its origin already was.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Saved")).toBeVisible()
		await expect(canvas.getByText("From space")).toBeVisible()
	},
})

export const ReplacingAValue = meta.story({
	args: {
		value: {
			...BLANK_SECRETS,
			scope: "bot",
			entries: [heldBy("ANTHROPIC_API_KEY", ["bot"])],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The only moment a value field belongs on a row. A stored secret cannot be read back, so replacing it is the sole reason to type here, and the field arrives on the row that asked for it rather than sitting under every key. Check the row does not grow, that the typed value is masked, and that the field goes away once the value is handed over.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(
			canvas.queryByLabelText("New value for ANTHROPIC_API_KEY"),
		).not.toBeInTheDocument()

		await userEvent.click(
			canvas.getByRole("button", { name: "Replace ANTHROPIC_API_KEY" }),
		)

		const field = canvas.getByLabelText("New value for ANTHROPIC_API_KEY")
		await userEvent.type(field, "sk-ant-next")
		await expect(field).toHaveAttribute("type", "password")

		await userEvent.click(canvas.getByRole("button", { name: "Save" }))

		await expect(args.onSave).toHaveBeenCalledWith(
			"ANTHROPIC_API_KEY",
			"sk-ant-next",
		)
		await expect(
			canvas.queryByLabelText("New value for ANTHROPIC_API_KEY"),
		).not.toBeInTheDocument()
	},
})

export const ARefusedWrite = meta.story({
	args: {
		value: {
			...BLANK_SECRETS,
			scope: "bot",
			entries: [heldBy("ANTHROPIC_API_KEY", ["bot"])],
			failures: { ANTHROPIC_API_KEY: "save" },
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A write the store refused. The refusal takes the place of the state tag on the row it belongs to, so the list stays one line a key and the reader still sees which key failed and that nothing changed.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Not saved")).toBeVisible()
		await expect(canvas.queryByText("Stored")).not.toBeInTheDocument()
	},
})

export const AskingForTheVaultPassphrase = meta.story({
	args: {
		value: { ...BLANK_SECRETS, isReady: false, needsPassphrase: true },
	},
	parameters: {
		docs: {
			description: {
				story:
					"No keychain answered on this machine, so the keys live in a vault that has to be opened first. Whichever of the three panels the reader opened asks the same question, and nothing else is shown until it is answered.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.queryByLabelText("Key")).not.toBeInTheDocument()

		await userEvent.type(canvas.getByLabelText("New passphrase"), "open sesame")
		await userEvent.click(
			canvas.getByRole("button", { name: "Create the vault" }),
		)

		await expect(args.onVaultUnlock).toHaveBeenCalledWith("open sesame")
	},
})

export const Unavailable = meta.story({
	args: {
		value: {
			...BLANK_SECRETS,
			isReady: false,
			entries: [heldBy("SHARED", ["bot"])],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The store out of reach with no passphrase to fix it. The panel refuses rather than pretends: every key reads as unavailable and nothing can be submitted.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Unavailable")).toBeVisible()
		await expect(canvas.getByRole("button", { name: "Add" })).toBeDisabled()
	},
})
