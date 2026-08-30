import { expect, fn, screen, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import {
	BOT_ENVIRONMENT,
	LONG_ENVIRONMENT_ENTRY,
	SERVER_ENVIRONMENT,
	SPACE_ENVIRONMENT,
} from "@workspace/ui/components/environment.fixtures"
import { EnvironmentPanel } from "@workspace/ui/components/environment-panel"

const meta = preview.meta({
	title: "Settings/Environment",
	component: EnvironmentPanel,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"Every environment variable handed to what this scope starts, listed by name alone. A value enters through the masked field and is never read back — no story, no state and no prop of this panel carries one, which is the whole point of the surface. What a row does carry is where the name is defined and which of the three scopes actually serves it, because a name written here can be silently replaced by a narrower one: space, then bot, then MCP server, the narrowest winning. The panel keeps nothing beyond the dialog it has open: it lists what it is given, reports a name and a typed value on set, and reports a name on delete.",
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
		scope: "bot" as const,
		entries: BOT_ENVIRONMENT,
		onSet: fn(),
		onDelete: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A bot seen from its own scope, holding all four kinds of row at once: inherited from the space, overriding the space, its own alone, and its own but beaten by a server. Check that the two marks read in opposite directions — `Overrides Space` on the row that wins, `Overridden by MCP server` on the row that loses — and that the inherited row offers neither replace nor remove, since a bot cannot delete what the space defines. Removing names the key before it reports anything.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("Overrides Space")).toBeVisible()
		await expect(canvas.getByText("Overridden by MCP server")).toBeVisible()
		await expect(
			canvas.getByText("Defined in Space · Served from Space"),
		).toBeVisible()

		await expect(
			canvas.queryByRole("button", { name: "Remove ATLAS_TOKEN" }),
		).not.toBeInTheDocument()

		await userEvent.click(
			canvas.getByRole("button", { name: "Remove BOT_SEED" }),
		)

		const question = await screen.findByRole("alertdialog")
		await expect(question).toHaveTextContent("Remove BOT_SEED?")
		await expect(args.onDelete).not.toHaveBeenCalled()

		await userEvent.click(
			within(question).getByRole("button", { name: "Remove variable" }),
		)

		await expect(args.onDelete).toHaveBeenCalledWith("BOT_SEED")
	},
})

export const SpaceScope = meta.story({
	args: { scope: "space" as const, entries: SPACE_ENVIRONMENT },
	parameters: {
		docs: {
			description: {
				story:
					"The widest scope, where every row is its own and nothing is inherited. Reach for this to check the losing side of the resolution: a space defines all three names and serves only one, the other two being taken over by a bot and by a server. Every row still offers removal, because the definition being removed is the space's own even when it is not the one served.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Overridden by Bot")).toBeVisible()
		await expect(
			canvas.getByRole("button", { name: "Remove ATLAS_REGION" }),
		).toBeVisible()
	},
})

export const ServerScope = meta.story({
	args: { scope: "server" as const, entries: SERVER_ENVIRONMENT },
	parameters: {
		docs: {
			description: {
				story:
					"The narrowest scope, where nothing can take a name away. Reach for this to check that no row is ever marked overridden here — a server's own definition always wins — and that a name it takes from the bot says so rather than looking like a name only it holds.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Overrides Bot")).toBeVisible()
		await expect(canvas.queryByText(/Overridden by/)).not.toBeInTheDocument()
	},
})

export const Empty = meta.story({
	args: { entries: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A scope nobody has given a variable. Reach for this over `Default` to check the one state that has to both say so and offer a way out of it: the sentence says what a variable is here and that its value is written once, before asking for one.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Add variable" }))

		const write = await screen.findByRole("dialog")
		await expect(within(write).getByLabelText("Value")).toHaveValue("")
	},
})

export const Unreadable = meta.story({
	args: { entries: [], hasFailedToRead: true },
	parameters: {
		docs: {
			description: {
				story:
					"The read of the scope came back refused. Reach for this to check that the panel says so rather than showing the empty state: an empty list and a failed read look the same on screen, and only one of the two means there is nothing stored. The message says nothing was lost and offers no way to add a variable, since the panel cannot know what it would be added beside.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Variables could not be read")).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Add variable" })).toBe(
			null,
		)
	},
})

export const UnreadableWithEntries = meta.story({
	args: { hasFailedToRead: true },
	parameters: {
		docs: {
			description: {
				story:
					"A read that came back refused after an earlier one had succeeded. Reach for this over `Unreadable` to check the case the reader is most likely to hit: the names already listed stay on screen, because they are the last thing known to be true, and the message sits above them to say the list may no longer match what is stored. Hiding the list here would take away the only thing the reader still has; showing it without the message would let a stale list pass for a current one.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Variables could not be read")).toBeVisible()
		await expect(canvas.getByText("BOT_SEED")).toBeVisible()
		await expect(
			canvas.getByRole("button", { name: "Add variable" }),
		).toBeVisible()
	},
})

export const RefusedName = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A name typed the way a shell would refuse it. Check that the submission is refused rather than corrected: the rule is named under the field, the dialog stays open on what was typed, and nothing is reported — a value must never leave this dialog for a name the program will not read.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Add variable" }))

		const write = await screen.findByRole("dialog")
		await userEvent.type(within(write).getByLabelText("Name"), "atlas token")
		await userEvent.type(within(write).getByLabelText("Value"), "s3cret")
		await userEvent.click(
			within(write).getByRole("button", { name: "Save variable" }),
		)

		await expect(
			within(write).getByText(
				"A name takes capital letters, digits and underscores, and starts with a letter or an underscore.",
			),
		).toBeVisible()
		await expect(args.onSet).not.toHaveBeenCalled()
	},
})

export const Error = meta.story({
	args: {
		onSet: fn(() => Promise.reject(new globalThis.Error("write refused"))),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A write the disk refuses. Reach for this over `RefusedName` when checking what happens after the panel has reported: the dialog is held open on the name and the value already typed, so the reader retries instead of typing a secret twice, and the failure is stated in the dialog rather than swallowed. The masked field still shows nothing of what it holds.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Add variable" }))

		const write = await screen.findByRole("dialog")
		await userEvent.type(within(write).getByLabelText("Name"), "NEW_TOKEN")
		await userEvent.type(within(write).getByLabelText("Value"), "s3cret")
		await userEvent.click(
			within(write).getByRole("button", { name: "Save variable" }),
		)

		await expect(
			await within(write).findByText(
				"This could not be written. Nothing changed — try again.",
			),
		).toBeVisible()
		await expect(within(write).getByLabelText("Name")).toHaveValue("NEW_TOKEN")
		await expect(within(write).getByLabelText("Value")).toHaveValue("s3cret")
	},
})

export const RejectedDelete = meta.story({
	args: {
		onDelete: fn(() => Promise.reject(new globalThis.Error("remove refused"))),
	},
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A removal the disk refuses, the other half of the failure channel `Error` covers for a write. Check that the question stays up on the key it named rather than closing on a press that did nothing, that its destructive action is out of reach while the callback is in flight so a second press cannot fire it twice, and that the failure is stated in the question itself. Cancelling after a failure is still the way out.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Remove BOT_SEED" }),
		)

		const question = await screen.findByRole("alertdialog")
		await userEvent.click(
			within(question).getByRole("button", { name: "Remove variable" }),
		)

		await expect(
			await within(question).findByText(
				"This could not be removed. Nothing changed — try again.",
			),
		).toBeVisible()
		await expect(question).toHaveTextContent("Remove BOT_SEED?")
	},
})

export const LongContent = meta.story({
	args: { entries: [LONG_ENVIRONMENT_ENTRY, ...BOT_ENVIRONMENT] },
	parameters: {
		docs: {
			description: {
				story:
					"A name long past the width of its row, as an inspector's queue URL variable tends to be. Check that it truncates on its own line rather than wrapping the row taller or pushing the mark off, and that the scope line under it keeps reading in full.",
			},
		},
	},
})
