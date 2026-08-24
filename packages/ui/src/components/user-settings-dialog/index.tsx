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

const FIRST_TAB = "profile"

const BREADCRUMB_AVATAR_SIZE = 32

type UserSettingsDialogProps = {
	open: boolean
	onClose: () => void
	value: UserSettingsValue
	onValueChange: (value: UserSettingsValue) => void
	onPictureUpload: (file: File) => void
	language: Language | null
	onLanguageChange: (language: Language | null) => void
	onPictureRemove?: () => void
	className?: string
}

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
