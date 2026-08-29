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
					"The one place a reader answers a key, wherever they open it from: a space, a bot, or a single MCP server. The three read the same because the question is the same, and only the owner behind the panel changes: what a space answers serves every bot in it, what a bot answers serves every server it starts, and a server's own value wins over both. Each row says which of those owners is actually serving it, so a reader can tell an inherited value from one they own before replacing it. Keys arrive two ways, named by hand here or asked for by an MCP configuration that references one, and both land in the same list.",
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
					"A bot answering nothing yet. There is no list to show, so the panel says how a key gets here at all: named above, or referenced by a server configuration. Check that naming a key alone is not enough to submit, since a key with no value stores nothing.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await expect(
			canvas.getByRole("button", { name: "Store the key" }),
		).toBeDisabled()

		await userEvent.type(canvas.getByLabelText("Key"), "ATLAS_TOKEN")
		await expect(
			canvas.getByRole("button", { name: "Store the key" }),
		).toBeDisabled()
	},
})

export const DeclaredByHand = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A key named and answered in one go, with nothing referencing it yet. This is what makes the panel usable before any MCP server exists. Check the value is masked as it is typed and that both fields empty once it is stored.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Key"), "ATLAS_TOKEN")
		await userEvent.type(canvas.getByLabelText("Value"), "sk-atlas")

		await expect(canvas.getByLabelText("Value")).toHaveAttribute(
			"type",
			"password",
		)

		await userEvent.click(canvas.getByRole("button", { name: "Store the key" }))

		await expect(args.onSave).toHaveBeenCalledWith("ATLAS_TOKEN", "sk-atlas")
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
		await expect(canvas.getByLabelText("ATLAS_TOKEN")).toBeVisible()
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
					"A bot panel over two keys: one the space answers for it, one the bot answers itself over the space's. Reach for this to check a reader can tell the two apart before replacing either, and that only the value this bot owns offers the plain delete.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("From this space")).toBeVisible()
		await expect(
			canvas.getByText(/instead of the one this space holds/i),
		).toBeVisible()
		await expect(
			canvas.getAllByRole("button", { name: "Delete" }),
		).toHaveLength(1)
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
					"The narrowest panel there is, over a key all three owners answer. The server's own value is the one that starts it, and the row says so by naming the bot value it displaces rather than listing all three.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(/instead of the one this bot holds/i),
		).toBeVisible()
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

		const question = await screen.findByRole("alertdialog")
		await expect(within(question).getByText("Delete SHARED?")).toBeVisible()

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
					"The two things the panel has to say after it acts, since neither shows in the list itself: which owner a value was written to, and which value serves a key now that the reader's own is gone. Without these a write at a shadowed owner would look like nothing happened.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Saved to this bot.")).toBeVisible()
		await expect(
			canvas.getByText("This space's value is used now."),
		).toBeVisible()
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
		await expect(
			canvas.getByRole("button", { name: "Store the key" }),
		).toBeDisabled()
	},
})
