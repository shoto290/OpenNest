import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	PromptCommandMenu,
	type PromptCommandMenuProps,
} from "@workspace/ui/components/prompt-command-menu"
import { PromptInput } from "@workspace/ui/components/prompt-input"

const named = (names: string[]) => names.map((name) => ({ name }))

const NAMES = [
	"/clear",
	"/compact",
	"/config",
	"/cost",
	"/help",
	"/init",
	"/model",
	"/review",
	"/status",
]

const DESCRIBED_COMMANDS = [
	{ name: "/clear", description: "Start a fresh conversation" },
	{
		name: "/compact",
		description: "Summarise the thread and free the context",
	},
	{
		name: "/config",
		description:
			"Open the settings panel to change the model, the theme, the permission mode and everything else this session reads at launch",
	},
	{ name: "/cost", description: "Show what this session has spent so far" },
	{ name: "/help" },
	{ name: "/review", description: "Review the pending changes on this branch" },
]

const LONG_NAMES = [
	...NAMES,
	"/agents",
	"/context",
	"/doctor",
	"/export",
	"/hooks",
	"/mcp",
	"/memory",
	"/permissions",
	"/release-notes-with-a-deliberately-long-command-name",
	"/resume",
	"/terminal-setup",
	"/vim",
]

const ComposedMenu = (props: PromptCommandMenuProps) => {
	const [draft, setDraft] = useState("/")

	return (
		<PromptCommandMenu {...props} query={draft.replace("/", "")}>
			<PromptInput value={draft} onValueChange={setDraft} aria-label="Prompt" />
		</PromptCommandMenu>
	)
}

const meta = preview.meta({
	title: "Conversation/Prompt/PromptCommandMenu",
	component: PromptCommandMenu,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The slash command popup of the composer: it lists the commands the running session reports, each with the one line said about it, filters them against the typed query and answers the keyboard while focus stays in the textarea. It draws only — the host owns `open`, `query` and what a selection does. ArrowUp/ArrowDown travel and wrap, Enter and Tab select, Escape or a press outside dismisses, and a query matching nothing renders no menu at all.\n\nThe list is a scrollable region and keeps a tab stop of its own, so it stays reachable to a keyboard on its own terms — the menu still answers the arrows while the composer holds focus, and Tab selects rather than moving into it.",
			},
		},
	},
	args: {
		commands: named(NAMES),
		open: true,
		query: "",
		onSelect: fn(),
		onDismiss: fn(),
		children: <PromptInput defaultValue="/" aria-label="Prompt" />,
	},
	argTypes: {
		open: { control: "boolean" },
		query: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className="flex h-[32rem] w-[34rem] max-w-full items-end">
				<Story />
			</div>
		),
	],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: the menu is open on an empty query, so every command the session reports is listed and the first row is the active one. Check that the panel sits above the composer on its leading edge, that exactly one row carries the highlight, and that Escape reports a dismissal to the host.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const options = canvas.getAllByRole("option")

		await expect(options).toHaveLength(NAMES.length)
		await expect(options[0]).toHaveAttribute("aria-selected", "true")
		await expect(options[1]).toHaveAttribute("aria-selected", "false")

		await userEvent.keyboard("{Escape}")
		await expect(args.onDismiss).toHaveBeenCalled()
	},
})

export const Filtered = meta.story({
	args: { query: "co" },
	parameters: {
		docs: {
			description: {
				story:
					"A typed query narrows the list — `co` keeps every command containing it, matched case-insensitively, and the highlight falls back to the first survivor. Check that the panel shrinks to the remaining rows and that clicking one reports that row's command rather than the active one.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const options = canvas.getAllByRole("option")

		await expect(options).toHaveLength(3)
		await expect(options[0]).toHaveAccessibleName("/compact")
		await expect(options[0]).toHaveAttribute("aria-selected", "true")

		await userEvent.click(options[2])
		await expect(args.onSelect).toHaveBeenCalledWith("/cost")
	},
})

export const KeyboardTravel = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The keyboard contract, with focus never leaving the composer: ArrowDown and ArrowUp move the highlight by one and wrap at both ends, Enter and Tab select whatever is highlighted. Check that neither arrow moves the caret in the textarea and that Enter selects instead of submitting the prompt.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const options = canvas.getAllByRole("option")

		await userEvent.keyboard("{ArrowUp}")
		await expect(options[NAMES.length - 1]).toHaveAttribute(
			"aria-selected",
			"true",
		)

		await userEvent.keyboard("{ArrowDown}")
		await expect(options[0]).toHaveAttribute("aria-selected", "true")

		await userEvent.keyboard("{ArrowDown}{ArrowDown}")
		await expect(options[2]).toHaveAttribute("aria-selected", "true")

		await userEvent.keyboard("{Enter}")
		await expect(args.onSelect).toHaveBeenCalledWith("/config")

		await userEvent.keyboard("{Tab}")
		await expect(args.onSelect).toHaveBeenCalledTimes(2)
	},
})

export const Described = meta.story({
	args: { commands: DESCRIBED_COMMANDS },
	parameters: {
		docs: {
			description: {
				story:
					"Commands carrying a description: it sits under the name in muted extra-small text, on one line. Check that a description far too long for the row truncates rather than wrapping or widening the panel, that the panel stops at its own maximum width, and that a command naming none keeps a single-line row.",
			},
		},
	},
	play: async ({ canvas }) => {
		const options = canvas.getAllByRole("option")

		await expect(options[0]).toHaveAccessibleName(
			"/clear Start a fresh conversation",
		)
		await expect(options[4]).toHaveAccessibleName("/help")
	},
})

export const LongContent = meta.story({
	args: { commands: named(LONG_NAMES) },
	parameters: {
		docs: {
			description: {
				story:
					"More commands than the panel can show, one of them far too long for its row. Check that the list scrolls instead of growing past the composer, that a long name truncates rather than widening the panel, and that travelling with the arrows keeps the active row in view.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.keyboard("{ArrowUp}")

		const options = canvas.getAllByRole("option")
		const last = options[options.length - 1]

		await expect(last).toHaveAttribute("aria-selected", "true")
		await expect(canvas.getByRole("listbox").scrollTop).toBeGreaterThan(0)
	},
})

export const QueryChanged = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The composer drives the query for real: the highlight is moved down twice, then more of the command is typed. Check that the new match list starts on its first row again rather than keeping the old offset, and that typing never disturbs the menu the way the arrows do.",
			},
		},
	},
	render: (args) => <ComposedMenu {...args} />,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("textbox", { name: "Prompt" }))
		await userEvent.keyboard("{ArrowDown}{ArrowDown}")

		await expect(canvas.getAllByRole("option")[2]).toHaveAttribute(
			"aria-selected",
			"true",
		)

		await userEvent.keyboard("co")

		const filtered = canvas.getAllByRole("option")
		await expect(filtered).toHaveLength(3)
		await expect(filtered[0]).toHaveAccessibleName("/compact")
		await expect(filtered[0]).toHaveAttribute("aria-selected", "true")
	},
})

export const Empty = meta.story({
	args: { query: "zzz" },
	parameters: {
		docs: {
			description: {
				story:
					"The query matches no command, so the menu renders nothing at all — no panel, no empty message, no keyboard capture. Check that the composer alone remains and that Enter reaches it, since the menu must not swallow a submission it has no row to answer with.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("listbox")).not.toBeInTheDocument()
	},
})
