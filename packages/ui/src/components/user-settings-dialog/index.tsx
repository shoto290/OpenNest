"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useState } from "react"

import { Content, Root, Title } from "@workspace/ui/components/dialog"
import { Icons } from "@workspace/ui/components/icons"
import { ProfilePictureField } from "@workspace/ui/components/profile-picture-field"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	RAIL_LABELS_MIN_WIDTH,
	SETTINGS_SCROLLING_PANEL_CLASS,
	SettingsRail,
	SettingsRailItem,
} from "@workspace/ui/components/settings-rail"
import { SETTINGS_HEADER_CLASS } from "@workspace/ui/components/settings-styles"
import { displayNameOf, UserAvatar } from "@workspace/ui/components/user-avatar"
import type { UserSettingsValue } from "@workspace/ui/components/user-settings"
import { AppearanceFields } from "@workspace/ui/components/user-settings-dialog/appearance-fields"
import { useIsNarrowerThan } from "@workspace/ui/hooks/use-is-narrower-than"
import { cn } from "@workspace/ui/lib/utils"

/** The tab a reader lands on, every time the dialog opens. Who they are comes
 * before how the app is painted. */
const FIRST_TAB = "profile"

const BREADCRUMB_AVATAR_SIZE = 32

type UserSettingsDialogProps = {
	open: boolean
	/** Fired for every way out — Escape, the backdrop, the corner affordance. The
	 * dialog never asks to confirm: nothing in it is unsaved. */
	onClose: () => void
	value: UserSettingsValue
	/** Fired on every edit — the dialog keeps no draft and owns no persistence. */
	onValueChange: (value: UserSettingsValue) => void
	/** Receives the picked, dropped or pasted file. The host turns it into a URL
	 * and writes it back as `value.image`; the dialog changes nothing it holds. */
	onPictureUpload: (file: File) => void
	/** Takes the reader's picture off. Left out, and the control offers no way to —
	 * the dialog never clears `value.image` itself. */
	onPictureRemove?: () => void
	className?: string
}

/**
 * Everything a reader is to the app, in one overlay: a breadcrumb wearing their own
 * face, a rail of two groups down the left and one group at a time on the right.
 * Profile is who they are — the name the app calls them and the picture it shows;
 * Appearance is how the app is painted for them.
 *
 * It is the same contract as a bot's settings and for the same reason: fully
 * controlled, saving as you type. Every edit emits `onValueChange` with the whole
 * value, and the dialog owns no draft, no debounce and no persistence — closing it
 * is never a question, because there is nothing unsaved to lose.
 */
const UserSettingsDialog = ({
	open,
	onClose,
	value,
	onValueChange,
	onPictureUpload,
	onPictureRemove,
	className,
}: UserSettingsDialogProps) => {
	const [tabs, setTabs] = useState<HTMLDivElement | null>(null)
	const iconsOnly = useIsNarrowerThan(tabs, RAIL_LABELS_MIN_WIDTH)
	const displayName = displayNameOf(value.name)

	const patch = (fields: Partial<UserSettingsValue>) =>
		onValueChange({ ...value, ...fields })

	return (
		<Root onOpenChange={(next) => !next && onClose()} open={open}>
			<Content
				className={cn(
					"h-[34rem] w-[52rem] gap-0 overflow-hidden p-0",
					className,
				)}
			>
				<header className={SETTINGS_HEADER_CLASS}>
					<UserAvatar
						image={value.image}
						name={displayName}
						size={BREADCRUMB_AVATAR_SIZE}
					/>
					<Title className="flex min-w-0 items-center gap-1.5 pr-0">
						<span className="truncate">{displayName}</span>
						<Icons.Next
							aria-hidden="true"
							className="size-3.5 shrink-0 text-muted-foreground"
						/>
						<span className="shrink-0 text-muted-foreground">Settings</span>
					</Title>
				</header>

				<Tabs.Root
					className="flex min-h-0 flex-1"
					defaultValue={FIRST_TAB}
					orientation="vertical"
					ref={setTabs}
				>
					<SettingsRail iconsOnly={iconsOnly}>
						<SettingsRailItem
							icon={Icons.User}
							iconsOnly={iconsOnly}
							label="Profile"
							value={FIRST_TAB}
						/>
						<SettingsRailItem
							icon={Icons.Image}
							iconsOnly={iconsOnly}
							label="Appearance"
							value="appearance"
						/>
					</SettingsRail>

					<Tabs.Panel
						className={SETTINGS_SCROLLING_PANEL_CLASS}
						value={FIRST_TAB}
					>
						<ProfilePictureField
							image={value.image}
							onPick={onPictureUpload}
							onRemove={onPictureRemove}
						/>
						<SettingsField
							label="Display name"
							onValueChange={(name) => patch({ name })}
							placeholder="No name"
							value={value.name}
						/>
					</Tabs.Panel>

					<Tabs.Panel
						className={SETTINGS_SCROLLING_PANEL_CLASS}
						value="appearance"
					>
						<AppearanceFields
							colorScheme={value.colorScheme}
							compact={iconsOnly}
							onColorSchemeChange={(colorScheme) => patch({ colorScheme })}
							onPaletteChange={(palette) => patch({ palette })}
							palette={value.palette}
						/>
					</Tabs.Panel>
				</Tabs.Root>
			</Content>
		</Root>
	)
}

export {
	UserSettingsDialog,
	type UserSettingsDialogProps,
	type UserSettingsValue,
}
