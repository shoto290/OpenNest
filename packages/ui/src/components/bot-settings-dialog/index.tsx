"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useState } from "react"

import {
	BotIdentityAvatar,
	type BotWorkingKind,
} from "@workspace/ui/components/bot-identity-avatar"
import { BotIdentityFields } from "@workspace/ui/components/bot-identity-fields"
import { DangerZone } from "@workspace/ui/components/bot-settings-dialog/danger-zone"
import { RuntimeFields } from "@workspace/ui/components/bot-settings-dialog/runtime-fields"
import { SettingsField } from "@workspace/ui/components/bot-settings-panel/settings-field"
import type {
	BotIdentity,
	BotModelOption,
	BotSettingsValue,
} from "@workspace/ui/components/bot-settings-panel/types"
import { Content, Root, Title } from "@workspace/ui/components/dialog"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import { Tooltip } from "@workspace/ui/components/motion/tooltip"
import { useIsNarrowerThan } from "@workspace/ui/hooks/use-is-narrower-than"
import { cn } from "@workspace/ui/lib/utils"

/** The tab a reader lands on, every time the dialog opens. Settings a bot has none
 * of yet are still the first thing to fill in — unless the host opened the dialog
 * to ask about a delete, which is a question only [`DANGER_TAB`] holds. */
const FIRST_TAB = "general"

const DANGER_TAB = "danger"

const UNNAMED_BOT = "Untitled bot"

/** Icons only below this width: a rail with its names takes 13rem, and a panel
 * holding a folder path or a grid of animals needs the rest of a 42rem row. */
const RAIL_LABELS_MIN_WIDTH = 672

const RAIL_ITEM_CLASS =
	"flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-muted-foreground text-sm outline-none transition-colors select-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:bg-muted data-active:font-medium data-active:text-foreground motion-reduce:transition-none"

const DANGER_RAIL_ITEM_CLASS = cn(
	RAIL_ITEM_CLASS,
	"text-destructive hover:bg-destructive/10 hover:text-destructive data-active:bg-destructive/10 data-active:text-destructive",
)

/** The panel leaving on a tab change is dropped out of the flow at once: Base UI
 * holds it one frame longer, and two panels sharing the row would be a flicker. */
const PANEL_CLASS =
	"flex min-h-0 flex-1 flex-col gap-4 p-5 outline-none data-ending-style:hidden"

const SCROLLING_PANEL_CLASS = cn(PANEL_CLASS, "overflow-y-auto")

type RailItemProps = {
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
const RailItem = ({
	icon: ItemIcon,
	label,
	value,
	iconsOnly,
	className,
}: RailItemProps) => {
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

type BotSettingsDialogProps = {
	open: boolean
	/** Fired for every way out — Escape, the backdrop, the corner affordance. The
	 * dialog never asks to confirm: nothing in it is unsaved. */
	onClose: () => void
	value: BotSettingsValue
	/** Fired on every edit — the dialog keeps no draft and owns no persistence. */
	onValueChange: (value: BotSettingsValue) => void
	models: BotModelOption[]
	/** Receives the picked, dropped or pasted file. The host turns it into a URL
	 * and writes it back as `value.identity.image`. */
	onAvatarUpload: (file: File) => void
	/** Opens the host's folder picker. */
	onBrowseWorkingDirectory: () => void
	/** The edited bot's id. It is what its blot's shape is derived from, so the
	 * breadcrumb shows the mark the roster row behind it is already showing. */
	seed?: string
	/** Fired only once the confirmation is accepted. */
	onDelete: () => void
	/** Whether the delete confirmation stands. Controlled, so a host with another way
	 * to ask — a row's context menu, a shortcut — lands on this one dialog instead of
	 * building a second one. Leave it out and the Danger zone tab owns it. */
	confirmingDelete?: boolean
	onConfirmingDeleteChange?: (confirming: boolean) => void
	/** The only thing that makes the breadcrumb avatar move. */
	working?: boolean
	/** What the bot is busy with while `working`. Its own animal performs it. */
	workingKind?: BotWorkingKind
	className?: string
}

/**
 * Everything a bot is, in one overlay: a breadcrumb naming the bot it belongs to,
 * a rail of groups down the left and one group at a time on the right. It is fully
 * controlled and saves as you type — every keystroke emits `onValueChange` with the
 * whole value, and the dialog owns no draft, no debounce and no persistence.
 *
 * The breadcrumb and the rail hold still; only the open group scrolls. Below 42rem
 * of content the rail drops to its icons, and only then do its items carry a
 * tooltip — a name a reader can already read is not worth saying twice.
 */
const BotSettingsDialog = ({
	open,
	onClose,
	value,
	onValueChange,
	models,
	onAvatarUpload,
	onBrowseWorkingDirectory,
	seed,
	onDelete,
	confirmingDelete,
	onConfirmingDeleteChange,
	working = false,
	workingKind,
	className,
}: BotSettingsDialogProps) => {
	const [internalConfirming, setInternalConfirming] = useState(false)
	const [tabs, setTabs] = useState<HTMLDivElement | null>(null)
	const iconsOnly = useIsNarrowerThan(tabs, RAIL_LABELS_MIN_WIDTH)
	const isConfirming = confirmingDelete ?? internalConfirming
	const botName = value.name.trim() || UNNAMED_BOT

	const patch = (fields: Partial<BotSettingsValue>) =>
		onValueChange({ ...value, ...fields })

	const setConfirming = (next: boolean) => {
		if (confirmingDelete === undefined) setInternalConfirming(next)
		onConfirmingDeleteChange?.(next)
	}

	return (
		<Root onOpenChange={(next) => !next && onClose()} open={open}>
			<Content
				className={cn(
					"h-[34rem] w-[52rem] gap-0 overflow-hidden p-0",
					className,
				)}
			>
				<header className="flex shrink-0 items-center gap-2.5 border-border border-b px-5 py-4 pr-14">
					<BotIdentityAvatar
						animal={value.identity.animal}
						blot={value.identity.blot}
						image={value.identity.image}
						kind={workingKind}
						seed={seed}
						size={32}
						working={working}
					/>
					<Title className="flex min-w-0 items-center gap-1.5 pr-0">
						<span className="truncate">{botName}</span>
						<Icons.Next
							aria-hidden="true"
							className="size-3.5 shrink-0 text-muted-foreground"
						/>
						<span className="shrink-0 text-muted-foreground">Settings</span>
					</Title>
				</header>

				<Tabs.Root
					className="flex min-h-0 flex-1"
					defaultValue={confirmingDelete ? DANGER_TAB : FIRST_TAB}
					orientation="vertical"
					ref={setTabs}
				>
					<Tabs.List
						className={cn(
							"flex shrink-0 flex-col gap-1 overflow-hidden border-border border-r p-2",
							iconsOnly ? "w-14" : "w-52",
						)}
						data-slot="bot-settings-rail"
					>
						<RailItem
							icon={Icons.Settings}
							iconsOnly={iconsOnly}
							label="General"
							value={FIRST_TAB}
						/>
						<RailItem
							icon={Icons.Image}
							iconsOnly={iconsOnly}
							label="Appearance"
							value="appearance"
						/>
						<RailItem
							icon={Icons.Docs}
							iconsOnly={iconsOnly}
							label="Instructions"
							value="instructions"
						/>
						<RailItem
							icon={Icons.Terminal}
							iconsOnly={iconsOnly}
							label="Runtime"
							value="runtime"
						/>
						<span
							aria-hidden="true"
							className="mx-1 my-1 h-px shrink-0 bg-border"
						/>
						<RailItem
							className={DANGER_RAIL_ITEM_CLASS}
							icon={Icons.Alert}
							iconsOnly={iconsOnly}
							label="Danger zone"
							value={DANGER_TAB}
						/>
					</Tabs.List>

					<Tabs.Panel className={SCROLLING_PANEL_CLASS} value={FIRST_TAB}>
						<SettingsField
							label="Name"
							onValueChange={(name) => patch({ name })}
							placeholder="No name"
							value={value.name}
						/>
						<SettingsField
							label="Title"
							onValueChange={(title) => patch({ title })}
							placeholder="Short role label"
							value={value.title}
						/>
					</Tabs.Panel>

					<Tabs.Panel className={SCROLLING_PANEL_CLASS} value="appearance">
						<BotIdentityFields
							identity={value.identity}
							onAvatarUpload={onAvatarUpload}
							onIdentityChange={(identity: BotIdentity) => patch({ identity })}
							seed={seed}
							working={working}
							workingKind={workingKind}
						/>
					</Tabs.Panel>

					<Tabs.Panel className={PANEL_CLASS} value="instructions">
						<SettingsField
							fill
							label="Instructions"
							onValueChange={(instructions) => patch({ instructions })}
							placeholder="The system prompt this bot always runs with"
							value={value.instructions}
						/>
					</Tabs.Panel>

					<Tabs.Panel className={SCROLLING_PANEL_CLASS} value="runtime">
						<RuntimeFields
							model={value.model}
							models={models}
							onBrowseWorkingDirectory={onBrowseWorkingDirectory}
							onModelChange={(model) => patch({ model })}
							workingDirectory={value.workingDirectory}
						/>
					</Tabs.Panel>

					<Tabs.Panel className={SCROLLING_PANEL_CLASS} value={DANGER_TAB}>
						<DangerZone
							botName={botName}
							confirming={isConfirming}
							onConfirmingChange={setConfirming}
							onDelete={onDelete}
						/>
					</Tabs.Panel>
				</Tabs.Root>
			</Content>
		</Root>
	)
}

export {
	type BotModelOption,
	BotSettingsDialog,
	type BotSettingsDialogProps,
	type BotSettingsValue,
}
