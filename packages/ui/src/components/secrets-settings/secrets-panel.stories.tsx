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
		await expect(canvas.getByLabelText("Value")).toHaveAttribute(
			"autocomplete",
			"off",
		)
	},
})

export const ARefusedAdd = meta.story({
	args: {
		value: {
			...BLANK_SECRETS,
			failures: { ANTHROPIC_API_KEY: "save" },
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A store that refuses the key being added. The value was typed once and cannot be read back from anywhere, so losing it costs the reader a trip to whoever issued it. Check both fields still hold what was typed and that the refusal is said next to them.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Key"), "ANTHROPIC_API_KEY")
		await userEvent.type(canvas.getByLabelText("Value"), "sk-ant-atlas")
		await userEvent.click(canvas.getByRole("button", { name: "Add" }))

		await expect(canvas.getByLabelText("Key")).toHaveValue("ANTHROPIC_API_KEY")
		await expect(canvas.getByLabelText("Value")).toHaveValue("sk-ant-atlas")
		await expect(canvas.getByText("Not saved")).toBeVisible()
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

		await expect(args.onDelete).toHaveBeenCalledWith(
			"SHARED",
			"space",
			undefined,
		)
	},
})

export const DeletingAKeyTheTabOwns = meta.story({
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
					"Deleting the tab's own value. A secret cannot be read back, so a slip here costs the reader the value itself, not a minute of retyping. The question names the key it is about to drop.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Delete ANTHROPIC_API_KEY" }),
		)
		await expect(args.onDelete).not.toHaveBeenCalled()

		const question = await screen.findByRole("alertdialog", {
			name: "Delete ANTHROPIC_API_KEY?",
		})
		await userEvent.click(
			within(question).getByRole("button", { name: "Delete" }),
		)

		await expect(args.onDelete).toHaveBeenCalledWith(
			"ANTHROPIC_API_KEY",
			"bot",
			undefined,
		)
	},
})

export const ServedByOneOfTheBotsServers = meta.story({
	args: {
		value: {
			...BLANK_SECRETS,
			scope: "bot",
			entries: [
				{
					key: "ANTHROPIC_API_KEY",
					owners: [
						{ scope: "bot", readable: true },
						{ scope: "server", server: "atlas", readable: true },
					],
					servedBy: { scope: "server", server: "atlas", readable: true },
				},
			],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A bot panel over a key one of its own servers answers for itself. The bot holds a value and it is not the one that runs, so the row names the server that wins rather than claiming the bot's is in use. Check the server is named, not merely called a server, since a bot can start several.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("From atlas")).toBeVisible()
		await expect(canvas.getByText("Overrides bot")).toBeVisible()

		await userEvent.click(
			canvas.getByRole("button", { name: "Delete from the server" }),
		)
		const question = await screen.findByRole("alertdialog", {
			name: "Delete ANTHROPIC_API_KEY?",
		})
		await userEvent.click(
			within(question).getByRole("button", { name: "Delete from the server" }),
		)

		await expect(args.onDelete).toHaveBeenCalledWith(
			"ANTHROPIC_API_KEY",
			"server",
			"atlas",
		)
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
		value: {
			...BLANK_SECRETS,
			isReady: false,
			needsPassphrase: true,
			hasVault: true,
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A vault that already exists, asked to open for this session. Whichever of the three panels the reader opened asks the same question, and nothing else is shown until it is answered. Pick `CreatingTheVault` for the first time, which asks twice.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.queryByLabelText("Key")).not.toBeInTheDocument()

		await userEvent.type(canvas.getByLabelText("Passphrase"), "open sesame")
		await userEvent.click(
			canvas.getByRole("button", { name: "Open the vault" }),
		)

		await expect(args.onVaultUnlock).toHaveBeenCalledWith("open sesame")
	},
})

export const CreatingTheVault = meta.story({
	args: {
		value: {
			...BLANK_SECRETS,
			isReady: false,
			needsPassphrase: true,
			hasVault: false,
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The passphrase that will create the vault, asked twice. Nothing can recover it and nothing else opens the vault, so a typo made once here would lock every secret away for good. Check the second field has to match before anything is submitted.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("New passphrase"), "open sesame")
		await expect(
			canvas.getByRole("button", { name: "Create the vault" }),
		).toBeDisabled()

		await userEvent.type(
			canvas.getByLabelText("Repeat the passphrase"),
			"open sesamd",
		)
		await expect(canvas.getByText("The two do not match.")).toBeVisible()
		await expect(args.onVaultUnlock).not.toHaveBeenCalled()

		await userEvent.clear(canvas.getByLabelText("Repeat the passphrase"))
		await userEvent.type(
			canvas.getByLabelText("Repeat the passphrase"),
			"open sesame",
		)
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
			loadFailed: true,
			entries: [heldBy("SHARED", ["bot"])],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The store out of reach with no passphrase to fix it. The panel says so in one line and refuses rather than pretending: the fields are read only and every key reads as unavailable. Reach for this to check the reader is never left with an inert form and no reason for it.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("Secret store unavailable right now."),
		).toBeVisible()
		await expect(canvas.getByText("Unavailable")).toBeVisible()
		await expect(canvas.getByRole("button", { name: "Add" })).toBeDisabled()
		await expect(canvas.getByLabelText("Key")).toHaveAttribute("readonly")
	},
})
