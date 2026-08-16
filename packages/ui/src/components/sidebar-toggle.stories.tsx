import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { AppHeader } from "@workspace/ui/components/app-header"
import {
	AnimatedSidebar,
	AnimatedSidebarContent,
	AnimatedSidebarGroupLabel,
	AnimatedSidebarHeader,
} from "@workspace/ui/components/motion/animated-sidebar"
import {
	SidebarToggle,
	type SidebarToggleProps,
} from "@workspace/ui/components/sidebar-toggle"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

const SIDEBAR = (
	<AnimatedSidebar ariaLabel="Workspace">
		<AnimatedSidebarHeader>
			<AnimatedSidebarGroupLabel>Workspace</AnimatedSidebarGroupLabel>
		</AnimatedSidebarHeader>
		<AnimatedSidebarContent />
	</AnimatedSidebar>
)

const renderShell = (defaultOpen: boolean) => (args: SidebarToggleProps) => (
	<WorkspaceShell defaultOpen={defaultOpen} sidebar={SIDEBAR}>
		<AppHeader leading={<SidebarToggle {...args} />} />
	</WorkspaceShell>
)

const meta = preview.meta({
	title: "Layout/SidebarToggle",
	component: SidebarToggle,
	render: renderShell(true),
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The sidebar's collapse control, packaged with its glyph so a screen can put it in a header without drawing anything. It reads the open state from the shell above it rather than holding one of its own, so the same control works from inside the panel it collapses or from the bar beside it, and Cmd/Ctrl+B stays in sync with it. Everything a button takes passes straight through — `aria-label`, `onClick`, a ref — and the click still toggles unless the handler prevents it.",
			},
		},
	},
	argTypes: {
		"aria-label": { control: "text" },
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					'The control in a header beside an expanded panel. Check that it is a single square target with the glyph centred in it, that it announces itself as "Toggle sidebar" with `aria-expanded=true`, and that one click flips the attribute to false while a second brings it back. Focus stays on the button across the toggle — it must not fall back to the page, or a second press would be unreachable — and Tab reaches it with a visible ring. Pick `Collapsed` for the resting rail, `Labelled` for a control named after what it opens.',
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const toggle = canvas.getByRole("button", { name: "Toggle sidebar" })

		await userEvent.tab()
		await expect(toggle).toHaveFocus()
		await expect(toggle.matches(":focus-visible")).toBe(true)
		await expect(toggle).toHaveAttribute("aria-expanded", "true")

		await userEvent.click(toggle)
		await expect(toggle).toHaveAttribute("aria-expanded", "false")
		await expect(toggle).toHaveFocus()

		await userEvent.click(toggle)
		await expect(toggle).toHaveAttribute("aria-expanded", "true")
	},
})

export const Collapsed = meta.story({
	render: renderShell(false),
	parameters: {
		docs: {
			description: {
				story:
					"The same control mounted beside a panel that opened on its rail, which is how a host restores a remembered choice through `defaultOpen`. Check that the button looks identical in both states — the glyph never mirrors or swaps — and that only `aria-expanded` carries the difference, since a header trigger that changed shape would read as a different action. Pick `Default` for the expanded panel.",
			},
		},
	},
	play: async ({ canvas }) => {
		const toggle = canvas.getByRole("button", { name: "Toggle sidebar" })
		await expect(toggle).toHaveAttribute("aria-expanded", "false")
	},
})

export const Labelled = meta.story({
	args: { "aria-label": "Toggle workspace" },
	parameters: {
		docs: {
			description: {
				story:
					'A screen naming the control after the panel it opens, the one override worth making when a window holds more than one. Check that the given name replaces the default instead of stacking with it, and that nothing visible changes — the name is for assistive technology alone. Everything else a button takes passes through the same way. Pick `Default` for the "Toggle sidebar" fallback.',
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("button", { name: "Toggle workspace" }),
		).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Toggle sidebar" })).toBe(
			null,
		)
	},
})
