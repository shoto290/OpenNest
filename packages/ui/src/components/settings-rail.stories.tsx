import { Tabs } from "@base-ui/react/tabs"
import { expect, screen, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import {
	SETTINGS_PANEL_CLASS,
	SettingsRail,
	SettingsRailBack,
	SettingsRailItem,
	type SettingsRailProps,
	SettingsRailSeparator,
	SettingsScrollingPanel,
} from "@workspace/ui/components/settings-rail"

const GROUPS = [
	{ icon: Icons.User, label: "Profile", value: "profile" },
	{ icon: Icons.Image, label: "Appearance", value: "appearance" },
	{ icon: Icons.Terminal, label: "Runtime", value: "runtime" },
]

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

export const WithBack = meta.story({
	args: {
		leading: (
			<>
				<SettingsRailBack
					iconsOnly={false}
					label="All skills"
					onClick={() => {}}
				/>
				<SettingsRailSeparator />
			</>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The rail of a surface a reader came into from somewhere else — a skill opened out of the list of them. Reach for this whenever the rail replaces another one: the way out stands where the first group would, above the list rather than inside it, so a screen reader counts the groups and never a button among them. Check that one Tab still reaches the groups, and that the way back is its own stop before them.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const back = canvas.getByRole("button", { name: "All skills" })

		back.focus()
		await userEvent.tab()
		await expect(canvas.getByRole("tab", { name: "Profile" })).toHaveFocus()
	},
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

const LONG_PANEL = Array.from(
	{ length: 30 },
	(_, index) => `Setting ${index + 1}`,
)

const renderScrollingPanels = (args: SettingsRailProps) => (
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
		</SettingsRail>
		<SettingsScrollingPanel value="profile">
			{LONG_PANEL.map((line) => (
				<span className="text-muted-foreground text-sm" key={line}>
					{line}
				</span>
			))}
		</SettingsScrollingPanel>
		<SettingsScrollingPanel value="appearance">
			<span className="text-muted-foreground text-sm">One short row</span>
		</SettingsScrollingPanel>
		<SettingsScrollingPanel value="runtime">
			<span className="text-muted-foreground text-sm">One short row</span>
		</SettingsScrollingPanel>
	</Tabs.Root>
)

export const ScrollingPanel = meta.story({
	render: renderScrollingPanels,
	parameters: {
		docs: {
			description: {
				story:
					"The panel beside the rail once its group runs past the height of the dialog. The panel scrolls natively and reserves its scrollbar gutter, so the rows keep the same width whether the group scrolls or not and nothing reflows when a reader switches from a long group to a short one. The thumb itself is drawn by the browser from `--scrollbar`, fading in on the way into the panel and out again on the way out. Check that the long group overflows and scrolls, and that the short group beside it measures the same content width.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const long = canvas.getByRole("tabpanel")

		await expect(long).toHaveClass("scrollbar-app")
		await expect(getComputedStyle(long).scrollbarGutter).toBe("stable")
		await expect(long.scrollHeight).toBeGreaterThan(long.clientHeight)
		const contentWidth = long.clientWidth

		long.scrollTop = 60
		await expect(long.scrollTop).toBe(60)

		await userEvent.click(canvas.getByRole("tab", { name: "Appearance" }))
		const short = canvas.getByRole("tabpanel")

		await waitFor(() =>
			expect(short.scrollHeight).toBeLessThanOrEqual(short.clientHeight),
		)
		await expect(short.clientWidth).toBe(contentWidth)
	},
})
