import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { botIdentityAvatars, slotsIn } from "@workspace/storybook/story-utils"
import { AppBootScreen } from "@workspace/ui/components/app-boot-screen"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

const meta = preview.meta({
	title: "Feedback/AppBootScreen",
	component: AppBootScreen,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The surface a desktop window opens on while it reads the record: the background of the palette in force, with the product's animal working on it. It says the app is starting and nothing more — no copy, no progress, no way out — so a host mounts it for exactly as long as its first read is in flight and swaps it for the screen the answer calls for. Reach for it on launch, never for a read a reader triggered: a refresh inside the app belongs to a skeleton where the data will land, not to a screen that takes the window back.",
			},
		},
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The launch moment. Check that the mark sits dead centre of the window rather than of its content, that the background is the palette's own — flip `theme_layout` to side-by-side, a white flash in dark mode is the bug this screen exists to kill — and that the mark is moving. Screen readers hear it once through the live region; nothing is drawn for them to read.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"Starting OpenNest",
		)
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(1)
	},
})

export const InLayout = meta.story({
	render: () => (
		<WorkspaceShell>
			<AppBootScreen data-tauri-drag-region="deep" />
		</WorkspaceShell>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Where the app actually mounts it — the shell's main column, with the drag region a frameless desktop window needs so the launch is still draggable. Check that it takes the full height of the column instead of collapsing to the mark, and that the background meets the shell with no seam. Pick `Default` to review the surface on its own.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [screen] = slotsIn(canvasElement, "app-boot-screen")

		await expect(screen).toHaveAttribute("data-tauri-drag-region", "deep")
		await expect(screen.getBoundingClientRect().height).toBe(window.innerHeight)
	},
})
