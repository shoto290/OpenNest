"use client"

import { Tabs } from "@base-ui/react/tabs"
import type { ReactNode } from "react"

import type { Icon } from "@workspace/ui/components/icons"
import { Tooltip } from "@workspace/ui/components/motion/tooltip"
import { cn } from "@workspace/ui/lib/utils"

/** Icons only below this width: a rail with its names takes 13rem, and a panel
 * holding a folder path or a grid of animals needs the rest of a 42rem row. */
const RAIL_LABELS_MIN_WIDTH = 672

const RAIL_ITEM_CLASS =
	"flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-muted-foreground text-sm outline-none transition-colors select-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:bg-muted data-active:font-medium data-active:text-foreground motion-reduce:transition-none"

/** The panel leaving on a tab change is dropped out of the flow at once: Base UI
 * holds it one frame longer, and two panels sharing the row would be a flicker. */
const SETTINGS_PANEL_CLASS =
	"flex min-h-0 flex-1 flex-col gap-4 p-5 outline-none data-ending-style:hidden"

const SETTINGS_SCROLLING_PANEL_CLASS = cn(
	SETTINGS_PANEL_CLASS,
	"overflow-y-auto",
)

type SettingsRailItemProps = {
	icon: Icon
	label: string
	value: string
	/** Drops the name off the screen — never out of the accessible tree — and hands
	 * it to a tooltip instead. */
	iconsOnly: boolean
	className?: string
}

/** One group in the rail. It carries a tooltip only while its name is off the
 * screen: a label a reader can already read does not need saying twice. */
const SettingsRailItem = ({
	icon: ItemIcon,
	label,
	value,
	iconsOnly,
	className,
}: SettingsRailItemProps) => {
	const tab = (
		<Tabs.Tab
			className={cn(RAIL_ITEM_CLASS, iconsOnly && "justify-center", className)}
			value={value}
		>
			<ItemIcon aria-hidden="true" className="size-4 shrink-0" />
			<span className={iconsOnly ? "sr-only" : undefined}>{label}</span>
		</Tabs.Tab>
	)

	if (!iconsOnly) return tab

	return (
		<Tooltip content={label} side="right" wrapperClassName="w-full">
			{tab}
		</Tooltip>
	)
}

/** The rule between a rail's groups and the one group that is not one of them. */
const SettingsRailSeparator = () => (
	<span aria-hidden="true" className="mx-1 my-1 h-px shrink-0 bg-border" />
)

type SettingsRailProps = {
	/** Whether the names are off the screen. Measured by the surface that owns the
	 * width, so the rail and the panel beside it answer the same question once. */
	iconsOnly: boolean
	children: ReactNode
	className?: string
}

/**
 * The column of groups down the left of a settings dialog. It holds its width and
 * never scrolls with the panel beside it, so a reader who scrolled a long group
 * finds the rail where they left it. Below the width its names fit in, it drops to
 * its icons and each item names itself with a tooltip instead.
 */
const SettingsRail = ({
	iconsOnly,
	children,
	className,
}: SettingsRailProps) => (
	<Tabs.List
		className={cn(
			"flex shrink-0 flex-col gap-1 overflow-hidden border-border border-r p-2",
			iconsOnly ? "w-14" : "w-52",
			className,
		)}
		data-slot="settings-rail"
	>
		{children}
	</Tabs.List>
)

export {
	RAIL_ITEM_CLASS,
	RAIL_LABELS_MIN_WIDTH,
	SETTINGS_PANEL_CLASS,
	SETTINGS_SCROLLING_PANEL_CLASS,
	SettingsRail,
	SettingsRailItem,
	type SettingsRailItemProps,
	type SettingsRailProps,
	SettingsRailSeparator,
}
