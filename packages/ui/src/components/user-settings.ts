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

type UserSettingsValue = {
	/** What the reader is called across the app. Empty is a real state — a reader
	 * who never filled it in reads as `You`. */
	name: string
	/** A picture the reader uploaded, already a URL the host will load. */
	image?: string
	colorScheme: ColorScheme
	palette: Palette
}

export {
	COLOR_SCHEME_IDS,
	COLOR_SCHEMES,
	type ColorScheme,
	type UserSettingsValue,
}
