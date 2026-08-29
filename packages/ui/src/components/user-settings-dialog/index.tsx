"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Avatar, displayNameOf } from "@workspace/ui/components/avatar"
import type {
	BotSkillDraft,
	BotSkillItem,
} from "@workspace/ui/components/bot-settings"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Content, Root, Title } from "@workspace/ui/components/dialog"
import { Icons } from "@workspace/ui/components/icons"
import {
	HistoryPanel,
	type PluginHistory,
} from "@workspace/ui/components/plugin-settings/history-panel"
import { useSkillSession } from "@workspace/ui/components/plugin-settings/use-skill-session"
import { ProfilePictureField } from "@workspace/ui/components/profile-picture-field"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	RAIL_LABELS_MIN_WIDTH,
	SETTINGS_PANEL_CLASS,
	SettingsRail,
	SettingsRailItem,
	SettingsScrollingPanel,
} from "@workspace/ui/components/settings-rail"
import {
	PICTURE_FIELD_SIZE,
	SETTINGS_HEADER_CLASS,
} from "@workspace/ui/components/settings-styles"
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
	skills: BotSkillItem[]
	onSkillCreate: (draft: BotSkillDraft, isPreloaded: boolean) => void
	onSkillChange: (id: string, draft: BotSkillDraft) => void
	onSkillPreloadedChange: (id: string, isPreloaded: boolean) => void
	onSkillDelete: (id: string) => void
	history: PluginHistory
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
	skills,
	onSkillCreate,
	onSkillChange,
	onSkillPreloadedChange,
	onSkillDelete,
	history,
	className,
}: UserSettingsDialogProps) => {
	const { t } = useTranslation("settings")
	const [tabs, setTabs] = useState<HTMLDivElement | null>(null)
	const [isLeaving, setLeaving] = useState(false)
	const iconsOnly = useIsNarrowerThan(tabs, RAIL_LABELS_MIN_WIDTH)
	const displayName = displayNameOf(value.name)
	const skillSession = useSkillSession({
		skills,
		onSkillChange,
		onSkillCreate,
		onSkillDelete,
		onSkillPreloadedChange,
	})

	const patch = (fields: Partial<UserSettingsValue>) =>
		onValueChange({ ...value, ...fields })

	const picture = value.image ? (
		<Avatar image={value.image} size={PICTURE_FIELD_SIZE} />
	) : (
		<Icons.User aria-hidden="true" className="size-6 text-muted-foreground" />
	)

	const leave = () => {
		skillSession.discard()
		onClose()
	}

	const close = () => (skillSession.isUnsaved ? setLeaving(true) : leave())

	return (
		<Root onOpenChange={(next) => !next && close()} open={open}>
			<Content
				className={cn(
					"h-[34rem] w-[52rem] gap-0 overflow-hidden p-0",
					className,
				)}
			>
				<header className={SETTINGS_HEADER_CLASS}>
					<Avatar
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

				{skillSession.editor ?? (
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
							<SettingsRailItem
								icon={Icons.Skill}
								iconsOnly={iconsOnly}
								label={t("rail.skills")}
								value="skills"
							/>
							<SettingsRailItem
								icon={Icons.History}
								iconsOnly={iconsOnly}
								label={t("rail.history")}
								value="history"
							/>
						</SettingsRail>

						<SettingsScrollingPanel value={FIRST_TAB}>
							<ProfilePictureField
								fileLabel={t("profile.picture.file")}
								isPlaceholder={!value.image}
								onPick={onPictureUpload}
								onRemove={value.image ? onPictureRemove : undefined}
								pickLabel={t(
									value.image
										? "profile.picture.change"
										: "profile.picture.add",
								)}
								preview={picture}
								removeLabel={t("profile.picture.remove")}
							/>
							<SettingsField
								label={t("profile.name.label")}
								onValueChange={(name) => patch({ name })}
								placeholder={t("profile.name.placeholder")}
								value={value.name}
							/>
						</SettingsScrollingPanel>

						<SettingsScrollingPanel value="appearance">
							<AppearanceFields
								colorScheme={value.colorScheme}
								onColorSchemeChange={(colorScheme) => patch({ colorScheme })}
							/>
						</SettingsScrollingPanel>

						<SettingsScrollingPanel value="notifications">
							<NotificationFields
								notifications={value.notifications}
								onNotificationsChange={(notifications) =>
									patch({ notifications })
								}
							/>
						</SettingsScrollingPanel>

						<SettingsScrollingPanel value="language">
							<LanguageFields
								language={language}
								onLanguageChange={onLanguageChange}
							/>
						</SettingsScrollingPanel>

						<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="skills">
							{skillSession.panel}
						</Tabs.Panel>

						<SettingsScrollingPanel value="history">
							<HistoryPanel
								authorName={t("plugin.author.bot")}
								commits={history.commits}
								onLoadDiff={history.onLoadDiff}
								onRevert={history.onRevert}
							/>
						</SettingsScrollingPanel>
					</Tabs.Root>
				)}

				<ConfirmDialog
					confirmLabel={t("skills.leave.action", { ns: "bots" })}
					description={t("skills.leave.description", { ns: "bots" })}
					onConfirm={leave}
					onOpenChange={setLeaving}
					open={isLeaving}
					title={t("skills.leave.title", { ns: "bots" })}
				/>
			</Content>
		</Root>
	)
}

export {
	UserSettingsDialog,
	type UserSettingsDialogProps,
	type UserSettingsValue,
}
