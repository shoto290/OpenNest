import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import type { BotMcpServerItem } from "@workspace/ui/components/bot-settings"
import {
	BOT_MCP_SERVERS,
	LONG_MCP_SERVER,
} from "@workspace/ui/components/bot-settings-dialog/mcp-servers.fixtures"
import { MARKED_APPLICATIONS } from "@workspace/ui/components/plugin-settings/applications.fixtures"
import {
	type ApplicationsOwner,
	ApplicationsPanel,
} from "@workspace/ui/components/plugin-settings/applications-panel"

const [LINEAR, GITHUB] = MARKED_APPLICATIONS
const [LOCAL, REMOTE] = BOT_MCP_SERVERS

const COMPANION = {
	kind: "companion",
	name: "Repository archivist",
	inherited: { spaceName: "Release desk", fromSpace: 2, fromProfile: 1 },
} satisfies ApplicationsOwner

const SPACE = {
	kind: "space",
	name: "Release desk",
	companionCount: 4,
} satisfies ApplicationsOwner

const PROFILE = { kind: "profile" } satisfies ApplicationsOwner

const NEEDS_AUTHORIZATION = {
	...GITHUB,
	connection: "needsAuthorization",
} satisfies BotMcpServerItem

const CONNECTING = {
	...LINEAR,
	connection: "connecting",
} satisfies BotMcpServerItem

const CONNECTED = {
	...LINEAR,
	connection: "connected",
} satisfies BotMcpServerItem

const FAILED = { ...LOCAL, connection: "failed" } satisfies BotMcpServerItem

const LONG_DISPLAY_NAME = {
	...LINEAR,
	name: "linear-enterprise",
	displayName: "Linear Enterprise workspace for the platform reliability guild",
} satisfies BotMcpServerItem

const meta = preview.meta({
	title: "Settings/Plugins/ApplicationsPanel",
	component: ApplicationsPanel,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The applications one owner connects to, shared by the companion, the space and the profile dialogs. The owner decides the sentence above the list, the empty title and description, and the footnote that closes the list; everything else is the same panel. A row reads as a mark, the name over its state, an action lane that only holds Connect or Retry, then a chevron. Taking a row reports the application; the panel keeps nothing.",
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
		owner: COMPANION,
		servers: MARKED_APPLICATIONS,
		onOpen: fn(),
		onAdd: fn(),
		onPaste: fn(),
		onConnect: fn(),
	},
})

export const Companion = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A companion with applications of its own and some it inherits. Check that the intro names the companion, that the footnote under its rule counts what the space and the profile add and leads nowhere, and that no row prints an address.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(
			canvas.getByText(
				"What Repository archivist connects to for tools it doesn’t have on its own.",
			),
		).toBeVisible()
		await expect(
			canvas.getByText(
				"Repository archivist also gets 3 applications it didn’t add: 2 from Release desk, 1 from your profile.",
			),
		).toBeVisible()
		await expect(canvas.queryByRole("link")).not.toBeInTheDocument()
		await expect(canvas.queryByText(/mcp\.linear\.app/)).not.toBeInTheDocument()

		await userEvent.click(canvas.getByRole("button", { name: "Open Linear" }))

		await expect(args.onOpen).toHaveBeenCalledWith(LINEAR)
	},
})

export const CompanionFromProfileOnly = meta.story({
	args: {
		owner: {
			...COMPANION,
			inherited: { spaceName: "Release desk", fromSpace: 0, fromProfile: 1 },
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A companion whose space shares nothing. Check that the source at zero is left out of the footnote rather than read as 0 from the space, and that the count takes its singular.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(
				"Repository archivist also gets 1 application it didn’t add: 1 from your profile.",
			),
		).toBeVisible()
	},
})

export const CompanionWithoutInheritance = meta.story({
	args: { owner: { kind: "companion", name: "Repository archivist" } },
	parameters: {
		docs: {
			description: {
				story:
					"A companion whose inherited counts were not handed to the panel. Check that no footnote is invented: the companion footnote has no form without a count.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByText(/also gets/)).not.toBeInTheDocument()
	},
})

export const Space = meta.story({
	args: { owner: SPACE },
	parameters: {
		docs: {
			description: {
				story:
					"The applications a space shares with every companion in it. Check that the intro counts the companions and that the footnote says a companion can still add its own.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("What all 4 companions in Release desk connect to."),
		).toBeVisible()
		await expect(
			canvas.getByText(
				"Each companion here can add applications of its own, and you can add some for every space.",
			),
		).toBeVisible()
	},
})

export const SpaceWithoutCount = meta.story({
	args: { owner: { kind: "space", name: "Release desk" } },
	parameters: {
		docs: {
			description: {
				story:
					"A space whose companion count was not handed to the panel. Check that the intro takes the form that states no count.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("What every companion in Release desk connects to."),
		).toBeVisible()
	},
})

export const Profile = meta.story({
	args: { owner: PROFILE },
	parameters: {
		docs: {
			description: {
				story:
					"The applications the person connects to in every space. Check the intro and the footnote that says they reach every companion.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("What you connect to, in every space."),
		).toBeVisible()
		await expect(
			canvas.getByText("These reach every companion you have, in every space."),
		).toBeVisible()
	},
})

export const EmptyCompanion = meta.story({
	args: { servers: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A companion with no application of its own. Check the three faded marks, the companion title and description, and that both ways in are offered: Add application and Paste a configuration.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("No applications of its own")).toBeVisible()

		await userEvent.click(
			canvas.getByRole("button", { name: "Add application" }),
		)
		await userEvent.click(
			canvas.getByRole("button", { name: "Paste a configuration" }),
		)

		await expect(args.onAdd).toHaveBeenCalledTimes(1)
		await expect(args.onPaste).toHaveBeenCalledTimes(1)
		await expect(canvas.queryByText(/also gets/)).not.toBeInTheDocument()
	},
})

export const EmptySpace = meta.story({
	args: { owner: SPACE, servers: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A space that shares nothing yet. Check that the title names the space and that no footnote closes an empty list.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("Nothing shared in Release desk yet"),
		).toBeVisible()
		await expect(
			canvas.getByText(
				"Add one here and every companion in this space gets its tools.",
			),
		).toBeVisible()
	},
})

export const EmptyProfile = meta.story({
	args: { owner: PROFILE, servers: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A person with no application of their own. Check the profile description, which says what belongs here rather than in a project.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("No applications of your own")).toBeVisible()
	},
})

export const NeedsAuthorization = meta.story({
	args: { servers: [NEEDS_AUTHORIZATION] },
	parameters: {
		docs: {
			description: {
				story:
					"An application that answered that nobody has authorized it yet. Check the amber dot beside its label, and that Connect is a target of its own: the keyboard reaches the row first, then Connect, each with its ring.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("Needs authorization")).toBeVisible()

		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: "Add application" }),
		).toHaveFocus()
		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: "Open GitHub" }),
		).toHaveFocus()
		await userEvent.tab()
		const connect = canvas.getByRole("button", { name: "Connect GitHub" })
		await expect(connect).toHaveFocus()

		await userEvent.click(connect)

		await expect(args.onConnect).toHaveBeenCalledWith(NEEDS_AUTHORIZATION)
		await expect(args.onOpen).not.toHaveBeenCalled()
	},
})

export const Connecting = meta.story({
	args: { servers: [CONNECTING] },
	parameters: {
		docs: {
			description: {
				story:
					"An application while its sign-in is open in the browser. Check that the dot breathes, holds still under reduced motion, and that the lane stays empty at its width with no spinner in the row.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Connecting…")).toBeVisible()
		await expect(
			canvas.queryByRole("button", { name: "Connect Linear" }),
		).not.toBeInTheDocument()
	},
})

export const Connected = meta.story({
	args: { servers: [CONNECTED] },
	parameters: {
		docs: {
			description: {
				story:
					"An authorized application at rest. Check that it says Connected and offers nothing in the lane.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Connected")).toBeVisible()
		await expect(
			canvas.queryByRole("button", { name: /Connect Linear|Retry Linear/ }),
		).not.toBeInTheDocument()
	},
})

export const Failed = meta.story({
	args: { servers: [FAILED] },
	parameters: {
		docs: {
			description: {
				story:
					"An application whose last attempt was refused. Check the destructive dot, the muted label, and Retry on the outline button.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("Couldn’t connect")).toBeVisible()

		await userEvent.click(canvas.getByRole("button", { name: "Retry atlas" }))

		await expect(args.onConnect).toHaveBeenCalledWith(FAILED)
	},
})

export const Unanswered = meta.story({
	args: { servers: [CONNECTED, REMOTE] },
	parameters: {
		docs: {
			description: {
				story:
					"An application no session has answered for yet, beside one that has. Check that the second row keeps its height with an empty second line, and that both chevrons stay aligned.",
			},
		},
	},
	play: async ({ canvas }) => {
		const [answered, silent] = canvas.getAllByRole("listitem")

		await expect(silent.getBoundingClientRect().height).toBe(
			answered.getBoundingClientRect().height,
		)
		await expect(
			canvas.getByRole("button", { name: "Open ledger" }),
		).toBeVisible()
	},
})

export const WithoutDisplayName = meta.story({
	args: { servers: [LINEAR, LOCAL] },
	parameters: {
		docs: {
			description: {
				story:
					"An application with a display name beside one known only by its slug. Check that the slug is set in the mono face and fills its mark slot with the server glyph on the muted surface.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("atlas")).toHaveClass("font-mono")
		await expect(canvas.getByText("Linear")).not.toHaveClass("font-mono")
	},
})

export const LongContent = meta.story({
	args: {
		servers: [LONG_DISPLAY_NAME, LONG_MCP_SERVER, ...MARKED_APPLICATIONS],
	},
	parameters: {
		docs: {
			description: {
				story:
					"Names wider than their column, in both faces. Check that each row holds one line and cuts the name with an ellipsis, with the lane and chevron in place.",
			},
		},
	},
	play: async ({ canvas }) => {
		const [long, short] = canvas.getAllByRole("listitem")

		await expect(long.getBoundingClientRect().height).toBe(
			short.getBoundingClientRect().height,
		)
	},
})

export const Unreadable = meta.story({
	args: { servers: [], haveFailedToLoad: true },
	parameters: {
		docs: {
			description: {
				story:
					"The read of this owner's applications was refused. The panel says so instead of showing the empty state.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("Couldn't load applications. Reopen settings to retry."),
		).toBeVisible()
		await expect(
			canvas.queryByRole("button", { name: "Add application" }),
		).not.toBeInTheDocument()
	},
})
