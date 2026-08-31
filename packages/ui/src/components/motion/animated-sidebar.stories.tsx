import type { ReactNode } from "react"
import { expect, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	FRAME_POLL,
	hasOverlayScrollbars,
	listExhaustively,
	Row,
	settled,
	slotIn,
} from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import {
	AnimatedSidebar,
	AnimatedSidebarContent,
	AnimatedSidebarFooter,
	AnimatedSidebarGroup,
	AnimatedSidebarGroupContent,
	AnimatedSidebarGroupLabel,
	AnimatedSidebarHeader,
	AnimatedSidebarInset,
	AnimatedSidebarMenu,
	AnimatedSidebarMenuButton,
	AnimatedSidebarMenuItem,
	type AnimatedSidebarProps,
	AnimatedSidebarProvider,
	AnimatedSidebarTrigger,
	type AnimatedSidebarVariant,
} from "@workspace/ui/components/motion/animated-sidebar"

const HOVER_HIGHLIGHT_CLASS = "hover:bg-sidebar-accent/70"

const layerOf = (drawer: HTMLElement) => {
	const layer = drawer.closest<HTMLElement>(
		"[data-slot='sidebar-mobile-layer']",
	)
	if (!layer) {
		throw new Error("The mobile drawer is not mounted inside its portal layer.")
	}
	return layer
}

interface NavItem {
	id: string
	label: string
	icon: ReactNode
	disabled?: boolean
}

const NAV_ITEMS: NavItem[] = [
	{
		id: "overview",
		label: "Overview",
		icon: <Icons.Home className="size-4" />,
	},
	{ id: "search", label: "Search", icon: <Icons.Search className="size-4" /> },
	{
		id: "documents",
		label: "Documents",
		icon: <Icons.FileCode className="size-4" />,
	},
	{
		id: "schedule",
		label: "Schedule",
		icon: <Icons.Calendar className="size-4" />,
	},
	{
		id: "security",
		label: "Security",
		icon: <Icons.Shield className="size-4" />,
	},
]

const LONG_NAV_ITEMS: NavItem[] = [
	{
		id: "overview",
		label: "Overview of everything happening in this workspace",
		icon: <Icons.Home className="size-4" />,
	},
	{
		id: "search",
		label: "Search across every document and attachment",
		icon: <Icons.Search className="size-4" />,
	},
	...Array.from({ length: 10 }, (_, index) => ({
		id: `archive-${index}`,
		label: `Archived quarterly report ${index + 1} — retained for audit`,
		icon: <Icons.FileCode className="size-4" />,
	})),
	{
		id: "security",
		label: "Security and access reviews",
		icon: <Icons.Shield className="size-4" />,
	},
]

const SIDEBAR_VARIANTS = listExhaustively<AnimatedSidebarVariant>({
	sidebar: true,
	floating: true,
	inset: true,
})

interface NavShellProps extends AnimatedSidebarProps {
	items?: NavItem[]
	activeId?: string
	defaultOpen?: boolean
	withFooter?: boolean
	isScrollable?: boolean
}

const NavShell = ({
	items = NAV_ITEMS,
	activeId = "overview",
	defaultOpen = true,
	withFooter = true,
	isScrollable = true,
	...sidebar
}: NavShellProps) => (
	<AnimatedSidebarProvider
		defaultOpen={defaultOpen}
		className="h-96 min-h-0 w-fit"
	>
		<AnimatedSidebar panelClassName="h-full" {...sidebar}>
			<AnimatedSidebarHeader>
				<AnimatedSidebarTrigger>
					<Icons.More className="size-4" />
				</AnimatedSidebarTrigger>
			</AnimatedSidebarHeader>
			<AnimatedSidebarContent isScrollable={isScrollable}>
				<AnimatedSidebarGroup>
					<AnimatedSidebarGroupLabel>Workspace</AnimatedSidebarGroupLabel>
					<AnimatedSidebarGroupContent>
						<AnimatedSidebarMenu>
							{items.map((item) => (
								<AnimatedSidebarMenuItem key={item.id}>
									<AnimatedSidebarMenuButton
										icon={item.icon}
										isActive={item.id === activeId}
										disabled={item.disabled}
									>
										{item.label}
									</AnimatedSidebarMenuButton>
								</AnimatedSidebarMenuItem>
							))}
						</AnimatedSidebarMenu>
					</AnimatedSidebarGroupContent>
				</AnimatedSidebarGroup>
			</AnimatedSidebarContent>
			{withFooter ? (
				<AnimatedSidebarFooter>
					<AnimatedSidebarMenu>
						<AnimatedSidebarMenuItem>
							<AnimatedSidebarMenuButton
								icon={<Icons.Settings className="size-4" />}
							>
								Preferences
							</AnimatedSidebarMenuButton>
						</AnimatedSidebarMenuItem>
					</AnimatedSidebarMenu>
				</AnimatedSidebarFooter>
			) : null}
		</AnimatedSidebar>
	</AnimatedSidebarProvider>
)

const DrawerShell = (sidebar: AnimatedSidebarProps) => (
	<AnimatedSidebarProvider>
		<AnimatedSidebar {...sidebar}>
			<AnimatedSidebarContent>
				<AnimatedSidebarGroup>
					<AnimatedSidebarGroupLabel>Workspace</AnimatedSidebarGroupLabel>
					<AnimatedSidebarGroupContent>
						<AnimatedSidebarMenu>
							{NAV_ITEMS.map((item) => (
								<AnimatedSidebarMenuItem key={item.id}>
									<AnimatedSidebarMenuButton
										icon={item.icon}
										isActive={item.id === "overview"}
									>
										{item.label}
									</AnimatedSidebarMenuButton>
								</AnimatedSidebarMenuItem>
							))}
						</AnimatedSidebarMenu>
					</AnimatedSidebarGroupContent>
				</AnimatedSidebarGroup>
			</AnimatedSidebarContent>
		</AnimatedSidebar>
		<AnimatedSidebarInset>
			<AnimatedSidebarHeader>
				<AnimatedSidebarTrigger>
					<Icons.More className="size-4" />
				</AnimatedSidebarTrigger>
			</AnimatedSidebarHeader>
		</AnimatedSidebarInset>
	</AnimatedSidebarProvider>
)

const meta = preview.meta({
	title: "Navigation/AnimatedSidebar",
	component: AnimatedSidebar,
	parameters: {
		docs: {
			description: {
				component:
					"The application shell's navigation panel: a provider owns the open state, the panel animates its width between the full and icon rails, and the inset takes the room that is left. Below the `md` breakpoint the same composition becomes a focus-trapped drawer. Every part is a slot — header, content, footer, groups, menus — so a product supplies its own routes without restyling the chrome.",
			},
		},
	},
	args: {
		variant: "sidebar",
		collapsible: "icon",
		side: "left",
		ariaLabel: "Primary",
	},
	argTypes: {
		variant: { control: "select", options: SIDEBAR_VARIANTS },
		collapsible: {
			control: "select",
			options: ["offcanvas", "icon", "none"],
		},
		side: { control: "inline-radio", options: ["left", "right"] },
	},
	render: (args) => <NavShell {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					'The nominal shell: expanded panel, five routes, one of them the current page, and a pinned footer row. Check that the trigger is the first stop of the tab order, that Enter and Space collapse and restore the panel, and that the current row is the only one carrying `aria-current="page"`. Hovering lights the row under the pointer through its own background — only the active pill travels between rows. Pick `States` to inspect the collapsed rail and every interactive state side by side, `InLayout` to see the panel against real page content.',
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Toggle sidebar" })

		await userEvent.tab()
		await expect(trigger).toHaveFocus()
		await expect(trigger).toHaveAttribute("aria-expanded", "true")

		await userEvent.keyboard("{Enter}")
		await expect(trigger).toHaveAttribute("aria-expanded", "false")

		await userEvent.keyboard(" ")
		await expect(trigger).toHaveAttribute("aria-expanded", "true")

		await userEvent.tab()
		const firstItem = canvas.getByRole("button", { name: "Overview" })
		await expect(firstItem).toHaveFocus()
		await expect(firstItem.matches(":focus-visible")).toBe(true)
		await expect(firstItem).toHaveAttribute("aria-current", "page")

		await userEvent.tab()
		const secondItem = canvas.getByRole("button", { name: "Search" })
		await expect(secondItem).toHaveFocus()
		await expect(secondItem).not.toHaveAttribute("aria-current")

		await expect(firstItem).toHaveClass(HOVER_HIGHLIGHT_CLASS)
		await expect(secondItem).toHaveClass(HOVER_HIGHLIGHT_CLASS)
	},
})

export const States = meta.story({
	parameters: {
		pseudo: {
			hover: ".menu-hovered",
			focusVisible: ".menu-focused",
			active: ".menu-pressed",
		},
		docs: {
			description: {
				story:
					"The two resting widths side by side, plus every interactive state of a row. Check that the collapsed rail keeps each row reachable with an accessible name — the visible label is faded out, so `aria-label` and `title` carry it — and that a disabled row is skipped by the pointer without dropping out of the list: it drops the hover classes entirely, so it cannot light up under the cursor. Pick `Default` for the expanded panel alone.",
			},
		},
	},
	render: () => (
		<Row>
			<AnimatedSidebarProvider defaultOpen className="h-96 min-h-0 w-fit">
				<AnimatedSidebar ariaLabel="Expanded sidebar" panelClassName="h-full">
					<AnimatedSidebarContent>
						<AnimatedSidebarGroup>
							<AnimatedSidebarGroupLabel>States</AnimatedSidebarGroupLabel>
							<AnimatedSidebarGroupContent>
								<AnimatedSidebarMenu>
									<AnimatedSidebarMenuItem>
										<AnimatedSidebarMenuButton
											icon={<Icons.Home className="size-4" />}
											isActive
										>
											Current
										</AnimatedSidebarMenuButton>
									</AnimatedSidebarMenuItem>
									<AnimatedSidebarMenuItem>
										<AnimatedSidebarMenuButton
											icon={<Icons.Search className="size-4" />}
										>
											Resting
										</AnimatedSidebarMenuButton>
									</AnimatedSidebarMenuItem>
									<AnimatedSidebarMenuItem>
										<AnimatedSidebarMenuButton
											className="menu-hovered"
											icon={<Icons.FileCode className="size-4" />}
										>
											Hovered
										</AnimatedSidebarMenuButton>
									</AnimatedSidebarMenuItem>
									<AnimatedSidebarMenuItem>
										<AnimatedSidebarMenuButton
											className="menu-focused"
											icon={<Icons.Calendar className="size-4" />}
										>
											Focused
										</AnimatedSidebarMenuButton>
									</AnimatedSidebarMenuItem>
									<AnimatedSidebarMenuItem>
										<AnimatedSidebarMenuButton
											className="menu-pressed"
											icon={<Icons.Tool className="size-4" />}
										>
											Pressed
										</AnimatedSidebarMenuButton>
									</AnimatedSidebarMenuItem>
									<AnimatedSidebarMenuItem>
										<AnimatedSidebarMenuButton
											disabled
											icon={<Icons.Shield className="size-4" />}
										>
											Disabled
										</AnimatedSidebarMenuButton>
									</AnimatedSidebarMenuItem>
								</AnimatedSidebarMenu>
							</AnimatedSidebarGroupContent>
						</AnimatedSidebarGroup>
					</AnimatedSidebarContent>
				</AnimatedSidebar>
			</AnimatedSidebarProvider>
			<NavShell
				ariaLabel="Collapsed sidebar"
				collapsible="icon"
				defaultOpen={false}
				items={[...NAV_ITEMS.slice(0, 4), { ...NAV_ITEMS[4], disabled: true }]}
			/>
		</Row>
	),
	play: async ({ canvas }) => {
		const expanded = within(
			canvas.getByRole("complementary", { name: "Expanded sidebar" }),
		)

		await expect(
			expanded.getByRole("button", { name: "Disabled" }),
		).not.toHaveClass(HOVER_HIGHLIGHT_CLASS)
		await expect(expanded.getByRole("button", { name: "Resting" })).toHaveClass(
			HOVER_HIGHLIGHT_CLASS,
		)

		const collapsed = canvas.getByRole("complementary", {
			name: "Collapsed sidebar",
		})
		const rail = within(collapsed)

		for (const item of NAV_ITEMS) {
			await expect(
				rail.getByRole("button", { name: item.label }),
			).toHaveAttribute("title", item.label)
		}

		await expect(rail.getByRole("button", { name: "Security" })).toBeDisabled()
		await expect(
			rail.getByRole("button", { name: "Overview" }),
		).toHaveAttribute("aria-current", "page")
	},
})

export const Variants = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every panel treatment, derived from the `variant` union so a new one fails to compile until it is documented here. Check the seam each treatment owns: `sidebar` shares a border with the page, `floating` detaches into a bordered card, `inset` drops its own surface and its border so the wrapper surface reaches the window edge behind it, leaving the shell around it to detach the page into a card. Pick `InLayout` to judge `inset` against the page area it is paired with.",
			},
		},
	},
	render: () => (
		<Row>
			{SIDEBAR_VARIANTS.map((variant) => (
				<NavShell
					key={variant}
					ariaLabel={`${variant} sidebar`}
					items={NAV_ITEMS.slice(0, 3)}
					variant={variant}
					withFooter={false}
				/>
			))}
		</Row>
	),
})

export const LongContent = meta.story({
	args: { ariaLabel: "Long sidebar" },
	parameters: {
		docs: {
			description: {
				story:
					"Labels wider than the panel and more rows than fit its height. Check that each label truncates on one line instead of wrapping the row taller, that the header and footer stay pinned while the middle scrolls, and that the horizontal overflow never appears. Pick `Default` for labels that fit.",
			},
		},
	},
	render: (args) => <NavShell {...args} items={LONG_NAV_ITEMS} />,
	play: async ({ canvasElement }) => {
		const content = slotIn(canvasElement, "sidebar-content")

		await waitFor(() => expect(hasOverlayScrollbars(content)).toBe(true))
		await expect(content.scrollHeight).toBeGreaterThan(content.clientHeight)
		await expect(content.clientWidth).toBe(content.offsetWidth)
		await expect(getComputedStyle(content).scrollbarWidth).toBe("none")
	},
})

export const ScrollHandedToChildren = meta.story({
	args: { ariaLabel: "Sidebar whose children scroll" },
	parameters: {
		docs: {
			description: {
				story:
					"`isScrollable={false}` for a content area that hands scrolling to a child — the carousel of `AppSidebar` is the case it exists for. No OverlayScrollbars instance is attached, so nothing rewrites the overflow of a surface that never scrolls and no child scroll position is disturbed on mount. Check that the content carries no instance. Pick `LongContent` for the usual case where the content scrolls itself.",
			},
		},
	},
	render: (args) => (
		<NavShell {...args} isScrollable={false} items={LONG_NAV_ITEMS} />
	),
	play: async ({ canvasElement }) => {
		const content = slotIn(canvasElement, "sidebar-content")

		await settled(content)
		await expect(hasOverlayScrollbars(content)).toBe(false)
	},
})

export const InLayout = meta.story({
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"The panel in its host: a trigger in the header and `AnimatedSidebarInset` holding the page. Check that collapsing the panel widens the page instead of overlapping it, that the trigger carries the keyboard path, and that focus lands visibly on the first row. Pick `Default` to judge the panel on its own.",
			},
		},
	},
	render: () => (
		<AnimatedSidebarProvider defaultOpen className="h-96 min-h-0">
			<AnimatedSidebar ariaLabel="Primary" panelClassName="h-full">
				<AnimatedSidebarHeader>
					<AnimatedSidebarTrigger aria-label="Toggle navigation">
						<Icons.More className="size-4" />
					</AnimatedSidebarTrigger>
				</AnimatedSidebarHeader>
				<AnimatedSidebarContent>
					<AnimatedSidebarGroup>
						<AnimatedSidebarGroupLabel>Workspace</AnimatedSidebarGroupLabel>
						<AnimatedSidebarGroupContent>
							<AnimatedSidebarMenu>
								{NAV_ITEMS.map((item) => (
									<AnimatedSidebarMenuItem key={item.id}>
										<AnimatedSidebarMenuButton
											href={`#${item.id}`}
											icon={item.icon}
											isActive={item.id === "overview"}
										>
											{item.label}
										</AnimatedSidebarMenuButton>
									</AnimatedSidebarMenuItem>
								))}
							</AnimatedSidebarMenu>
						</AnimatedSidebarGroupContent>
					</AnimatedSidebarGroup>
				</AnimatedSidebarContent>
			</AnimatedSidebar>
			<AnimatedSidebarInset>
				<div className="flex flex-col gap-3 p-6">
					<h1 className="font-heading text-xl">Overview</h1>
					<p className="max-w-prose text-muted-foreground text-sm">
						The inset owns the page. It keeps its own scroll and reflows as the
						panel changes width, so nothing here has to know whether the sidebar
						is expanded or collapsed to an icon rail.
					</p>
				</div>
			</AnimatedSidebarInset>
		</AnimatedSidebarProvider>
	),
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Toggle navigation" })

		await userEvent.tab()
		await expect(trigger).toHaveFocus()

		await userEvent.tab()
		const firstLink = canvas.getByRole("link", { name: "Overview" })
		await expect(firstLink).toHaveFocus()
		await expect(firstLink.matches(":focus-visible")).toBe(true)
		await expect(firstLink).toHaveAttribute("aria-current", "page")
	},
})

export const Drawer = meta.story({
	args: { "aria-busy": true },
	globals: { viewport: { value: "mobile" } },
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Below the `md` breakpoint the panel stops being a column and becomes a focus-trapped drawer over the page, opened from a trigger the page keeps. Check that nothing is left behind in the layout — no landmark, no rail — and that the drawer is the dialog carrying the panel's own name. Check too that what is handed to `AnimatedSidebar` still lands on it here: `aria-busy` has to reach the drawer exactly as it reaches the desktop panel, or a busy sidebar goes quiet on a narrow window. Pick `DrawerExit` for the way back out, `InLayout` for the two-column shell.",
			},
		},
	},
	render: (args) => <DrawerShell {...args} />,
	play: async ({ canvas, userEvent }) => {
		const overlay = within(document.body)
		const trigger = canvas.getByRole("button", { name: "Toggle sidebar" })

		await expect(canvas.queryByRole("complementary")).toBeNull()

		await userEvent.click(trigger)
		await expect(trigger).toHaveAttribute("aria-expanded", "true")

		const drawer = overlay.getByRole("dialog", { name: "Primary" })
		await settled(drawer)

		await expect(drawer).toHaveAttribute("data-slot", "sidebar-mobile-panel")
		await expect(drawer).toHaveAttribute("aria-busy", "true")
	},
})

export const DrawerExit = meta.story({
	globals: { viewport: { value: "mobile" } },
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"The way out of the drawer, dismissed from the scrim covering the page. Check that the drawer and the scrim travel away instead of blinking out: the layer holding them keeps its `visibility` for as long as the tween runs and only goes hidden once it lands. Check too that the drawer leaves the accessibility tree the moment the dismiss is asked for rather than when the animation ends — the exit is for the eye, not for the screen reader. Pick `Drawer` for the way in.",
			},
		},
	},
	render: (args) => <DrawerShell {...args} />,
	play: async ({ canvas, userEvent }) => {
		const overlay = within(document.body)
		const trigger = canvas.getByRole("button", { name: "Toggle sidebar" })

		await userEvent.click(trigger)
		const drawer = overlay.getByRole("dialog", { name: "Primary" })
		await settled(drawer)

		const layer = layerOf(drawer)
		await userEvent.click(
			overlay.getByRole("button", { name: "Close sidebar" }),
		)
		await expect(getComputedStyle(layer).visibility).toBe("visible")
		await expect(trigger).toHaveAttribute("aria-expanded", "false")
		await expect(drawer).toHaveAttribute("aria-hidden", "true")

		await waitFor(async () => {
			await expect(getComputedStyle(layer).visibility).toBe("hidden")
		}, FRAME_POLL)
	},
})
