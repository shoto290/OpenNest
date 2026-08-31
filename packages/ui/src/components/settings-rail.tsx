"use client"

import { Tabs } from "@base-ui/react/tabs"
import {
	type ComponentProps,
	type ReactElement,
	type ReactNode,
	useRef,
} from "react"

import { type Icon, Icons } from "@workspace/ui/components/icons"
import { Tooltip } from "@workspace/ui/components/motion/tooltip"
import { useOverlayScrollbars } from "@workspace/ui/hooks/use-overlay-scrollbars"
import { cn, mergeRefs } from "@workspace/ui/lib/utils"

const RAIL_LABELS_MIN_WIDTH = 672

const RAIL_ITEM_CLASS =
	"flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-muted-foreground text-sm outline-none select-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:bg-muted data-active:font-medium data-active:text-foreground"

const DANGER_RAIL_ITEM_CLASS = cn(
	RAIL_ITEM_CLASS,
	"text-destructive hover:bg-destructive/10 hover:text-destructive data-active:bg-destructive/10 data-active:text-destructive",
)

const SETTINGS_PANEL_CLASS =
	"flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-5 outline-none data-ending-style:hidden"

const SETTINGS_SCROLLING_PANEL_CLASS = cn(
	SETTINGS_PANEL_CLASS,
	"overflow-y-auto",
)

type SettingsScrollingPanelProps = Omit<
	ComponentProps<typeof Tabs.Panel>,
	"className"
>

const SettingsScrollingPanel = ({
	ref,
	...props
}: SettingsScrollingPanelProps) => {
	const panel = useRef<HTMLDivElement>(null)
	useOverlayScrollbars(panel)

	return (
		<Tabs.Panel
			{...props}
			className={SETTINGS_SCROLLING_PANEL_CLASS}
			ref={mergeRefs<HTMLDivElement>(panel, ref)}
		/>
	)
}

const named = (item: ReactElement, label: string, iconsOnly: boolean) =>
	iconsOnly ? (
		<Tooltip content={label} side="right" wrapperClassName="w-full">
			{item}
		</Tooltip>
	) : (
		item
	)

type SettingsRailItemProps = {
	icon: Icon
	label: string
	value: string
	iconsOnly: boolean
	className?: string
}

const SettingsRailItem = ({
	icon: ItemIcon,
	label,
	value,
	iconsOnly,
	className,
}: SettingsRailItemProps) =>
	named(
		<Tabs.Tab
			className={cn(RAIL_ITEM_CLASS, iconsOnly && "justify-center", className)}
			value={value}
		>
			<ItemIcon aria-hidden="true" className="size-4 shrink-0" />
			<span className={iconsOnly ? "sr-only" : undefined}>{label}</span>
		</Tabs.Tab>,
		label,
		iconsOnly,
	)

type SettingsRailBackProps = {
	label: string
	onClick: () => void
	iconsOnly: boolean
}

const SettingsRailBack = ({
	label,
	onClick,
	iconsOnly,
}: SettingsRailBackProps) =>
	named(
		<button
			className={cn(RAIL_ITEM_CLASS, iconsOnly && "justify-center")}
			onClick={onClick}
			type="button"
		>
			<Icons.Previous aria-hidden="true" className="size-4 shrink-0" />
			<span className={iconsOnly ? "sr-only" : undefined}>{label}</span>
		</button>,
		label,
		iconsOnly,
	)

const SettingsRailSeparator = () => (
	<span aria-hidden="true" className="mx-1 my-1 h-px shrink-0 bg-border" />
)

type SettingsRailProps = {
	iconsOnly: boolean
	leading?: ReactNode
	children: ReactNode
	className?: string
}

const SettingsRail = ({
	iconsOnly,
	leading,
	children,
	className,
}: SettingsRailProps) => (
	<div
		className={cn(
			"flex shrink-0 flex-col gap-1 overflow-hidden border-border border-r p-2",
			iconsOnly ? "w-14" : "w-52",
			className,
		)}
		data-slot="settings-rail"
	>
		{leading}
		<Tabs.List className="flex min-h-0 flex-col gap-1 overflow-y-auto">
			{children}
		</Tabs.List>
	</div>
)

export {
	DANGER_RAIL_ITEM_CLASS,
	RAIL_ITEM_CLASS,
	RAIL_LABELS_MIN_WIDTH,
	SETTINGS_PANEL_CLASS,
	SettingsRail,
	SettingsRailBack,
	type SettingsRailBackProps,
	SettingsRailItem,
	type SettingsRailItemProps,
	type SettingsRailProps,
	SettingsRailSeparator,
	SettingsScrollingPanel,
	type SettingsScrollingPanelProps,
}
