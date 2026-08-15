import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { AppHeader } from "@workspace/ui/components/app-header"
import { Button } from "@workspace/ui/components/button"
import { ConnectionStatus } from "@workspace/ui/components/connection-status"
import { Icons } from "@workspace/ui/components/icons"

const meta = preview.meta({
	title: "Layout/AppHeader",
	component: AppHeader,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The one fixed bar above a screen: a leading identity slot and a trailing slot pinned to the opposite edge. It is a shell, not a navigation bar — it holds no routes, tabs or menu, so a single-screen app can use it without growing one. Both slots are optional and the trailing slot stays right whether or not the leading one is filled.",
			},
		},
	},
	args: {
		trailing: <ConnectionStatus state="ready" version="2.1.233" />,
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a single-screen app whose window chrome already names the product: nothing to say on the leading edge, agent status on the trailing one. Check that the status still sits hard right with the leading slot empty. Pick `WithIcons` when the surface needs to name itself inside the viewport.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("banner")).toBeVisible()
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"Claude Code ready",
		)
	},
})

export const InLayout = meta.story({
	args: { insetWindowControls: true },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this in a desktop window whose title bar is transparent, so the web view starts at the top edge and the OS paints its close/minimise/zoom buttons over this row. Check that the leading gutter is wide enough that nothing collides with those controls, and that the status still holds the trailing edge. Pick `Default` in a browser tab, where no gutter is owed.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("banner")).toHaveClass(/pl-20/)
	},
})

export const WithIcons = meta.story({
	args: {
		leading: (
			<>
				<Icons.Claude aria-hidden="true" className="size-4" />
				OpenNest
			</>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this in a browser tab or an embedded view, where no OS title bar carries the product name. Check that the two slots stay on one row and that the leading mark never pushes the status off the trailing edge. Pick `Default` in a desktop window that already shows the title.",
			},
		},
	},
})

export const WithAction = meta.story({
	args: {
		leading: <>OpenNest</>,
		trailing: (
			<>
				<ConnectionStatus state="crashed" />
				<Button size="xs" variant="outline">
					<Icons.Retry data-icon="inline-start" />
					Restart
				</Button>
			</>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the trailing slot has to carry more than a status — here a dead session and the control that revives it. Check that status and button stay grouped on the trailing edge with the gap between them, rather than spreading across the bar. Pick `Default` when the status alone is the whole story.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button", { name: "Restart" })).toBeVisible()
	},
})

export const LongContent = meta.story({
	globals: { viewport: { value: "mobile" } },
	args: {
		leading: (
			<>
				<Icons.Claude aria-hidden="true" className="size-4" />A workspace name
				long enough to run out of room on a narrow window
			</>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to check the collision the two slots can have: a leading label wider than the bar. Check that the trailing status keeps its full width and stays legible while the leading side gives up the space. Pick `WithIcons` for the nominal width.",
			},
		},
	},
})
