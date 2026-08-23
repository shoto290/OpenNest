"use client"

import { useTranslation } from "react-i18next"

import { SettingsGroup } from "@workspace/ui/components/settings-group"
import { SettingsSwitch } from "@workspace/ui/components/settings-switch"
import {
	DEFAULT_NOTIFICATIONS,
	NOTIFIED_EVENTS,
	type Notifications,
} from "@workspace/ui/components/user-settings"

type NotificationFieldsProps = {
	/** Which moments the reader is told about. Left out, the default — all of them,
	 * which is what a host that has not wired the choice yet owes a reader. */
	notifications?: Notifications
	/** Fired with all three, the flipped one among them. The group holds nothing:
	 * the switch moves once the host writes the choice down. */
	onNotificationsChange: (notifications: Notifications) => void
	className?: string
}

/**
 * What a reader is told about, one switch to a moment: a bot asking them something,
 * a bot asking leave, a bot going quiet. Each row says under its name what turning
 * it off costs — a moment nobody is told about is one a bot waits at forever.
 */
const NotificationFields = ({
	notifications = DEFAULT_NOTIFICATIONS,
	onNotificationsChange,
	className,
}: NotificationFieldsProps) => {
	const { t } = useTranslation("settings")

	return (
		<div className={className} data-slot="notification-fields">
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
		</div>
	)
}

export { NotificationFields, type NotificationFieldsProps }
