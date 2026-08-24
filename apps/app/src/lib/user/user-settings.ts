import {
	DEFAULT_NOTIFICATIONS,
	NOTIFIED_EVENTS,
	type Notifications,
	type NotifiedEvent,
	type UserSettingsValue,
} from "@workspace/ui/components/user-settings"

import type { ThemePreferences } from "./theme-mirror"
import type { NotificationChange, UserProfile } from "./user-controller"

import { avatarSrc } from "../host"

const NOTIFICATION_FIELDS: Record<NotifiedEvent, NotificationChange["field"]> =
	{
		question: "notifyOnQuestion",
		permission: "notifyOnPermission",
		turn: "notifyOnFinishedTurn",
	}

const toNotifications = (profile: UserProfile): Notifications => ({
	question: profile.notifyOnQuestion,
	permission: profile.notifyOnPermission,
	turn: profile.notifyOnFinishedTurn,
})

export const toUserSettingsValue = (
	profile: UserProfile,
	theme: ThemePreferences,
): UserSettingsValue => ({
	name: profile.displayName,
	image: avatarSrc(profile.profilePicturePath),
	colorScheme: theme.colorScheme,
	palette: theme.palette,
	notifications: toNotifications(profile),
})

export const toNotificationChange = (
	next: UserSettingsValue,
	previous: UserSettingsValue,
): NotificationChange | null => {
	const notifications = next.notifications ?? DEFAULT_NOTIFICATIONS
	const shown = previous.notifications ?? DEFAULT_NOTIFICATIONS
	const flipped = NOTIFIED_EVENTS.find(
		(event) => notifications[event] !== shown[event],
	)
	if (flipped === undefined) {
		return null
	}
	return {
		field: NOTIFICATION_FIELDS[flipped],
		isEnabled: notifications[flipped],
	}
}
