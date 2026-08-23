import type { Palette } from "@workspace/ui/lib/palettes"

/** The two schemes the app paints in, and the choice to follow the machine. The
 * host holds the same three words at its own boundary, so a fourth never reaches
 * the file this dialog edits. */
const COLOR_SCHEMES = {
	light: "Light",
	dark: "Dark",
	system: "System",
} as const satisfies Record<string, string>

type ColorScheme = keyof typeof COLOR_SCHEMES

const COLOR_SCHEME_IDS = Object.keys(COLOR_SCHEMES) as ColorScheme[]

/** The moments in a bot's turn worth telling a reader about. Each is a key the
 * catalogue names, so a fourth added here fails the type check rather than showing
 * a reader its own id. */
const NOTIFIED_EVENTS = ["question", "permission", "turn"] as const

type NotifiedEvent = (typeof NOTIFIED_EVENTS)[number]

type Notifications = Record<NotifiedEvent, boolean>

/** What a reader is told about until they say otherwise: all of it. A bot that
 * asked a question nobody heard is the failure this default is against, so silence
 * is only ever something a reader chose. */
const DEFAULT_NOTIFICATIONS: Notifications = {
	question: true,
	permission: true,
	turn: true,
}

type UserSettingsValue = {
	/** What the reader is called across the app. Empty is a real state — a reader
	 * who never filled it in reads as `You`. */
	name: string
	/** A picture the reader uploaded, already a URL the host will load. */
	image?: string
	colorScheme: ColorScheme
	palette: Palette
	/** Which moments the reader is told about. Left out, the default — a host that
	 * has not wired the choice yet still shows the switches, on, rather than a gap. */
	notifications?: Notifications
}

export {
	COLOR_SCHEME_IDS,
	COLOR_SCHEMES,
	type ColorScheme,
	DEFAULT_NOTIFICATIONS,
	NOTIFIED_EVENTS,
	type Notifications,
	type NotifiedEvent,
	type UserSettingsValue,
}
