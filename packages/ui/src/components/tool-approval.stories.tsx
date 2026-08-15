import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	ToolApproval,
	ToolApprovalCode,
	type ToolApprovalParameter,
} from "@workspace/ui/components/tool-approval"

const BASH_COMMAND = "rm -rf apps/app/dist && bun run build"

const BASH_PARAMETERS: ToolApprovalParameter[] = [
	{ id: "command", label: "command", value: BASH_COMMAND },
	{
		id: "description",
		label: "description",
		value: "Rebuild the desktop bundle from scratch",
	},
	{ id: "timeout", label: "timeout", value: "120000" },
]

const WRITE_PARAMETERS: ToolApprovalParameter[] = [
	{
		id: "file_path",
		label: "file_path",
		value: "/Users/ada/opennest/.env.local",
	},
	{ id: "content", label: "content", sensitive: true },
]

const meta = preview.meta({
	title: "AI/ToolApproval",
	component: ToolApproval,
	parameters: {
		docs: {
			description: {
				component:
					'The blocking surface for a Claude Code `canUseTool` callback: the agent is paused until the user answers. `Allow once` maps to `{ behavior: "allow", updatedInput }` and `Deny` to `{ behavior: "deny", message }` — both one-shot. There is deliberately no `Always allow`, because persisting a rule means echoing a `localSettings` suggestion into `updatedPermissions`, which writes to `.claude/settings.local.json` and is out of scope for V0.1.',
			},
		},
	},
	args: {
		tool: "Bash",
		description: "Claude wants to clear the build output before rebuilding it.",
		parameters: BASH_PARAMETERS,
		children: <ToolApprovalCode code={BASH_COMMAND} />,
		onAllowOnce: fn(),
		onDeny: fn(),
	},
	argTypes: {
		status: { control: "select", options: ["pending", "allowed", "denied"] },
	},
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-xl">
				<Story />
			</div>
		),
	],
})

export const Default = meta.story({
	args: { status: "pending" },
	parameters: {
		docs: {
			description: {
				story:
					"The only state the user can act on: the `canUseTool` callback has fired and execution is blocked until it returns. Check that `Allow once` and `Deny` are both reachable by keyboard in that order, that each fires on `Enter` and `Space`, and that no third control offers to remember the decision — a permanent rule is not part of this surface. `Allowed` and `Denied` cover what the card becomes once the callback has returned.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const details = canvas.getByRole("button", { name: /tool input/i })
		const allowOnce = canvas.getByRole("button", { name: /allow once/i })
		const deny = canvas.getByRole("button", { name: /deny/i })

		details.focus()

		await userEvent.tab()
		await expect(allowOnce).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onAllowOnce).toHaveBeenCalledTimes(1)

		await userEvent.tab()
		await expect(deny).toHaveFocus()
		await userEvent.keyboard(" ")
		await expect(args.onDeny).toHaveBeenCalledTimes(1)

		await expect(
			canvas.queryByRole("button", { name: /always/i }),
		).not.toBeInTheDocument()
	},
})

export const Allowed = meta.story({
	args: { status: "allowed" },
	parameters: {
		docs: {
			description: {
				story:
					'What the card becomes after the callback returned `{ behavior: "allow" }` for this single call. Check that the decision row is gone — the grant covers this invocation only, so re-offering `Allow once` would imply a standing permission the callback never granted. Progress and output of the tool run itself belong to the result surface, not here.',
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("status")).toHaveTextContent("Allowed once")
		await expect(
			canvas.queryByRole("button", { name: /allow once/i }),
		).not.toBeInTheDocument()
	},
})

export const Denied = meta.story({
	args: {
		status: "denied",
		description:
			"Claude was told the build output is managed by the release job, and asked to leave it alone.",
	},
	parameters: {
		docs: {
			description: {
				story:
					'What the card becomes after the callback returned `{ behavior: "deny", message }`. Reach for this to check the deny message reads as the reason Claude receives and may adapt to, not as an error — the tool never ran, so `Error` would be the wrong frame. The decision row is gone here too: denial ends the prompt.',
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("status")).toHaveTextContent("Denied")
		await expect(
			canvas.queryByRole("button", { name: /deny/i }),
		).not.toBeInTheDocument()
	},
})

export const WithRedactedInput = meta.story({
	args: {
		tool: "Write",
		title: "Allow this file to be written?",
		description: "Claude wants to write credentials into a local env file.",
		parameters: WRITE_PARAMETERS,
		children: undefined,
		status: "pending",
		defaultOpen: true,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the tool input carries something the user must not see rendered — an API key, a token, a password. A parameter marked `sensitive` takes no `value` at all, so the secret never reaches props or the DOM, and the row shows `Hidden` instead. Check the user can still tell what is being written, and where, without the payload.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Hidden")).toBeVisible()
		await expect(
			canvas.getByText("/Users/ada/opennest/.env.local"),
		).toBeVisible()
	},
})
