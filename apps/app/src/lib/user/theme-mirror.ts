import {
	DEFAULT_PALETTE,
	PALETTE_IDS,
	type Palette,
} from "@workspace/ui/lib/palettes"

import type { ColorScheme, UserPreferences } from "./preferences-contract"
import { userPreferencesStore } from "./preferences-transport"

/** The two keys the first paint reads. The stored record is the source of truth,
 * but it only arrives over IPC: what `localStorage` holds is the copy the window
 * paints itself with before the host has answered. */
const COLOR_SCHEME_KEY = "theme"
const PALETTE_KEY = "palette"

const COLOR_SCHEMES: ColorScheme[] = ["system", "light", "dark"]

const DEFAULT_COLOR_SCHEME: ColorScheme = "system"

export type ThemePreferences = {
	colorScheme: ColorScheme
	palette: Palette
}

const colorSchemeOf = (value: string | null): ColorScheme =>
	COLOR_SCHEMES.find((scheme) => scheme === value) ?? DEFAULT_COLOR_SCHEME

/** The palette list is this side's, and the record holds free text: a name this
 * build does not ship paints as the default rather than as nothing. */
const paletteOf = (value: string | null): Palette =>
	PALETTE_IDS.find((palette) => palette === value) ?? DEFAULT_PALETTE

const themeOf = (record: UserPreferences): ThemePreferences => ({
	colorScheme: colorSchemeOf(record.colorScheme),
	palette: paletteOf(record.palette),
})

export const sameTheme = (one: ThemePreferences, other: ThemePreferences) =>
	one.colorScheme === other.colorScheme && one.palette === other.palette

export const readMirror = (): ThemePreferences => ({
	colorScheme: colorSchemeOf(localStorage.getItem(COLOR_SCHEME_KEY)),
	palette: paletteOf(localStorage.getItem(PALETTE_KEY)),
})

export const isMirrorKey = (key: string | null) =>
	key === COLOR_SCHEME_KEY || key === PALETTE_KEY

export const writeMirror = (theme: ThemePreferences) => {
	localStorage.setItem(COLOR_SCHEME_KEY, theme.colorScheme)
	localStorage.setItem(PALETTE_KEY, theme.palette)
}

/** What the host holds, or nothing when it refused: a record that cannot be read
 * leaves the window painting the mirror it opened with. */
export const readStoredTheme = async (): Promise<ThemePreferences | null> => {
	try {
		return themeOf(await userPreferencesStore.read())
	} catch {
		return null
	}
}

/** The record is written whole, so the rest of it is read back and echoed: a
 * scheme or a palette chosen here must not clear the name or the picture. A
 * refused call is dropped — the mirror already holds what is painted. */
export const storeTheme = async (theme: ThemePreferences) => {
	try {
		const record = await userPreferencesStore.read()
		await userPreferencesStore.write({ ...record, ...theme })
	} catch {
		return
	}
}
