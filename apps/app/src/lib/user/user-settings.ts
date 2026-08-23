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

/** The one place the dialog's three switches and the record's three fields are
 * named against each other. The dialog names a moment in a turn, the record names
 * the field it is stored in. */
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

/** The whole of what the reader is, from the two halves that hold it: the name, the
 * picture and the switches from the record, the scheme and the palette from the
 * provider painting the window. It is what the settings edit and what the chip
 * wears.
 *
 * The stored path never reaches an `img` — what a webview may load is the asset
 * protocol the host scoped to the one directory pictures live in. */
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

/** Which switch the dialog just flipped, as the record names it, or nothing when
 * this edit was some other field. The value carries all three at once and one
 * press moves one of them, so the write is the field that differs rather than the
 * three the dialog handed back. */
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
