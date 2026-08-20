import { Tabs } from "@base-ui/react/tabs"
import { expect, screen } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import {
	SETTINGS_PANEL_CLASS,
	SettingsRail,
	SettingsRailItem,
	type SettingsRailProps,
	SettingsRailSeparator,
} from "@workspace/ui/components/settings-rail"

const GROUPS = [
	{ icon: Icons.User, label: "Profile", value: "profile" },
	{ icon: Icons.Image, label: "Appearance", value: "appearance" },
	{ icon: Icons.Terminal, label: "Runtime", value: "runtime" },
]

/** The group that never sits with the others — a rule stands between it and them. */
const DANGER = { icon: Icons.Alert, label: "Danger zone", value: "danger" }

const renderRail = (args: SettingsRailProps) => (
	<Tabs.Root
		className="flex h-72 w-[36rem] overflow-hidden rounded-2xl border border-border"
		defaultValue="profile"
		orientation="vertical"
	>
		<SettingsRail {...args}>
			{GROUPS.map((group) => (
				<SettingsRailItem
					icon={group.icon}
					iconsOnly={args.iconsOnly}
					key={group.value}
					label={group.label}
					value={group.value}
				/>
			))}
			<SettingsRailSeparator />
			<SettingsRailItem
				icon={DANGER.icon}
				iconsOnly={args.iconsOnly}
				label={DANGER.label}
				value={DANGER.value}
			/>
		</SettingsRail>
		{[...GROUPS, DANGER].map((group) => (
			<Tabs.Panel
				className={SETTINGS_PANEL_CLASS}
				key={group.value}
				value={group.value}
			>
				<span className="text-muted-foreground text-sm">{group.label}</span>
			</Tabs.Panel>
		))}
	</Tabs.Root>
)

const meta = preview.meta({
	title: "Navigation/SettingsRail",
	component: SettingsRail,
	render: renderRail,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The column of groups down the left of a settings dialog — a bot's, a reader's own. It holds its width and never scrolls with the panel beside it, so a reader who scrolled a long group finds the rail where they left it. One tab stop reaches it and the arrow keys walk it: walking is not opening, so nobody drags a grid of animals past on the way to the group they wanted. The surface that owns the width decides when the names leave, and hands the answer to the rail and to the panel beside it at once.",
			},
		},
	},
	args: { iconsOnly: false, children: null },
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The rail with room for its names. Check that the open group is the filled row rather than a tinted one, that one Tab reaches the rail and the arrows walk it without opening anything, and that no item carries a tooltip — a name already on the screen is not worth saying twice. Pick `IconsOnly` for the narrow surface.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const profile = canvas.getByRole("tab", { name: "Profile" })
		const appearance = canvas.getByRole("tab", { name: "Appearance" })

		profile.focus()
		await userEvent.keyboard("{ArrowDown}")
		await expect(appearance).toHaveFocus()
		await expect(appearance).toHaveAttribute("aria-selected", "false")

		await userEvent.keyboard("{Enter}")
		await expect(appearance).toHaveAttribute("aria-selected", "true")
	},
})

export const IconsOnly = meta.story({
	args: { iconsOnly: true },
	parameters: {
		docs: {
			description: {
				story:
					"The rail once the surface is too narrow for its names — the state the dialog switches to below 42rem of content. Check that the rail keeps every item reachable and still named to a screen reader, that the icons are centred in the narrower column, and that a name dropped off the screen comes back as a tooltip on hover and on focus. Pick `Default` for the named rail.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const [rail] = slotsIn(canvasElement, "settings-rail")
		const appearance = canvas.getByRole("tab", { name: "Appearance" })

		await expect(rail.getBoundingClientRect().width).toBeLessThan(80)
		await userEvent.hover(appearance)
		await expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"Appearance",
		)
	},
})
