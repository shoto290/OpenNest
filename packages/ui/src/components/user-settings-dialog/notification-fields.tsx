"use client"

import { useTranslation } from "react-i18next"

import { SettingsGroup } from "@workspace/ui/components/settings-group"
import { SettingsSwitch } from "@workspace/ui/components/settings-switch"
import {
	DEFAULT_NOTIFICATIONS,
	NOTIFIED_EVENTS,
	type Notifications,
} from "@workspace/ui/components/user-settings"
import { cn } from "@workspace/ui/lib/utils"

type NotificationFieldsProps = {
	notifications?: Notifications
	onNotificationsChange: (notifications: Notifications) => void
	className?: string
}

const NotificationFields = ({
	notifications = DEFAULT_NOTIFICATIONS,
	onNotificationsChange,
	className,
}: NotificationFieldsProps) => {
	const { t } = useTranslation("settings")

	return (
		<div
			className={cn("flex flex-col gap-5", className)}
			data-slot="notification-fields"
		>
			<SettingsGroup grid="gap-2" label={t("notifications.label")}>
				{NOTIFIED_EVENTS.map((event) => (
					<SettingsSwitch
						checked={notifications[event]}
						description={t(`notifications.event.${event}.description`)}
						key={event}
						label={t(`notifications.event.${event}.label`)}
						onCheckedChange={(notified) =>
							onNotificationsChange({ ...notifications, [event]: notified })
						}
					/>
				))}
			</SettingsGroup>
			<SettingsGroup grid="gap-2" label={t("notifications.sound.label")}>
				<SettingsSwitch
					checked={notifications.sound}
					description={t("notifications.sound.description")}
					label={t("notifications.sound.switch")}
					onCheckedChange={(plays) =>
						onNotificationsChange({ ...notifications, sound: plays })
					}
				/>
			</SettingsGroup>
		</div>
	)
}

export { NotificationFields, type NotificationFieldsProps }
