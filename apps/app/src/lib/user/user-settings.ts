import {
	DEFAULT_NOTIFICATIONS,
	NOTIFICATION_SWITCHES,
	type NotificationSwitch,
	type Notifications,
	type UserSettingsValue,
} from "@workspace/ui/components/user-settings"

import type { UserPreferences } from "./preferences-contract"
import type {
	NotificationChange,
	ReaderPreferences,
} from "./preferences-controller"

import { avatarSrc } from "../host"

const NOTIFICATION_FIELDS: Record<
	NotificationSwitch,
	NotificationChange["field"]
> = {
	question: "notifyOnQuestion",
	permission: "notifyOnPermission",
	turn: "notifyOnFinishedTurn",
	sound: "notifyWithSound",
}

const toNotifications = (record: UserPreferences): Notifications => ({
	question: record.notifyOnQuestion,
	permission: record.notifyOnPermission,
	turn: record.notifyOnFinishedTurn,
	sound: record.notifyWithSound,
})

export const toUserSettingsValue = (
	record: ReaderPreferences,
): UserSettingsValue => ({
	name: record.displayName,
	image: avatarSrc(record.profilePicturePath),
	colorScheme: record.colorScheme,
	palette: record.palette,
	notifications: toNotifications(record),
})

export const toNotificationChange = (
	next: UserSettingsValue,
	previous: UserSettingsValue,
): NotificationChange | null => {
	const notifications = next.notifications ?? DEFAULT_NOTIFICATIONS
	const shown = previous.notifications ?? DEFAULT_NOTIFICATIONS
	const flipped = NOTIFICATION_SWITCHES.find(
		(name) => notifications[name] !== shown[name],
	)
	if (flipped === undefined) {
		return null
	}
	return {
		field: NOTIFICATION_FIELDS[flipped],
		isEnabled: notifications[flipped],
	}
}
