import type { Palette } from "@workspace/ui/lib/palettes"

const COLOR_SCHEMES = {
	light: "Light",
	dark: "Dark",
	system: "System",
} as const satisfies Record<string, string>

type ColorScheme = keyof typeof COLOR_SCHEMES

const COLOR_SCHEME_IDS = Object.keys(COLOR_SCHEMES) as ColorScheme[]

const NOTIFIED_EVENTS = ["question", "permission", "turn"] as const

type NotifiedEvent = (typeof NOTIFIED_EVENTS)[number]

const NOTIFICATION_SWITCHES = [...NOTIFIED_EVENTS, "sound"] as const

type NotificationSwitch = (typeof NOTIFICATION_SWITCHES)[number]

type Notifications = Record<NotificationSwitch, boolean>

const DEFAULT_NOTIFICATIONS: Notifications = {
	question: true,
	permission: true,
	turn: true,
	sound: true,
}

type UserSettingsValue = {
	name: string
	image?: string
	colorScheme: ColorScheme
	palette: Palette
	notifications?: Notifications
}

export {
	COLOR_SCHEME_IDS,
	COLOR_SCHEMES,
	type ColorScheme,
	DEFAULT_NOTIFICATIONS,
	NOTIFICATION_SWITCHES,
	NOTIFIED_EVENTS,
	type NotificationSwitch,
	type Notifications,
	type NotifiedEvent,
	type UserSettingsValue,
}
