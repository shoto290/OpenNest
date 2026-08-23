"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useState } from "react"
import { useTranslation } from "react-i18next"

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
import { LanguageFields } from "@workspace/ui/components/user-settings-dialog/language-fields"
import { NotificationFields } from "@workspace/ui/components/user-settings-dialog/notification-fields"
import { useIsNarrowerThan } from "@workspace/ui/hooks/use-is-narrower-than"
import type { Language } from "@workspace/ui/lib/i18n"
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
	/** The language that was chosen, or `null` for none chosen — the machine tile,
	 * which is what the app follows until a reader picks a language themselves. It is
	 * the one field that does not travel in `value`: what the interface reads in
	 * lives in the translation runtime, so the host holds the choice apart. */
	language: Language | null
	/** Fired with the language chosen, or `null` when the reader hands the choice
	 * back to the machine. The dialog holds nothing: the host writes the choice down
	 * and the tick follows. */
	onLanguageChange: (language: Language | null) => void
	/** Takes the reader's picture off. Left out, and the control offers no way to —
	 * the dialog never clears `value.image` itself. */
	onPictureRemove?: () => void
	className?: string
}

/**
 * Everything a reader is to the app, in one overlay: a breadcrumb wearing their own
 * face, a rail of four groups down the left and one group at a time on the right.
 * Profile is who they are — the name the app calls them and the picture it shows;
 * Appearance is how the app is painted for them; Notifications is what it tells them
 * about; Language is the one it speaks to them in.
 *
 * It is the same contract as a bot's settings and for the same reason: fully
 * controlled, saving as you type. Every edit emits the whole value through
 * `onValueChange` — bar the two the value does not carry, the picture and the
 * language, which have a callback each — and the dialog owns no draft, no debounce
 * and no persistence: closing it is never a question, because there is nothing
 * unsaved to lose.
 */
const UserSettingsDialog = ({
	open,
	onClose,
	value,
	onValueChange,
	onPictureUpload,
	onPictureRemove,
	language,
	onLanguageChange,
	className,
}: UserSettingsDialogProps) => {
	const { t } = useTranslation("settings")
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
						<span className="shrink-0 text-muted-foreground">
							{t("breadcrumb.title")}
						</span>
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
							label={t("rail.profile")}
							value={FIRST_TAB}
						/>
						<SettingsRailItem
							icon={Icons.Image}
							iconsOnly={iconsOnly}
							label={t("rail.appearance")}
							value="appearance"
						/>
						<SettingsRailItem
							icon={Icons.Bell}
							iconsOnly={iconsOnly}
							label={t("rail.notifications")}
							value="notifications"
						/>
						<SettingsRailItem
							icon={Icons.Language}
							iconsOnly={iconsOnly}
							label={t("rail.language")}
							value="language"
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
							label={t("profile.name.label")}
							onValueChange={(name) => patch({ name })}
							placeholder={t("profile.name.placeholder")}
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

					<Tabs.Panel
						className={SETTINGS_SCROLLING_PANEL_CLASS}
						value="notifications"
					>
						<NotificationFields
							notifications={value.notifications}
							onNotificationsChange={(notifications) =>
								patch({ notifications })
							}
						/>
					</Tabs.Panel>

					<Tabs.Panel
						className={SETTINGS_SCROLLING_PANEL_CLASS}
						value="language"
					>
						<LanguageFields
							language={language}
							onLanguageChange={onLanguageChange}
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
