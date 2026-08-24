import {
	DEFAULT_PALETTE,
	PALETTE_IDS,
	type Palette,
} from "@workspace/ui/lib/palettes"

import type { ColorScheme, UserPreferences } from "./preferences-contract"
import { changePreferences, readPreferences } from "./preferences-queue"

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

export const readStoredTheme = async (): Promise<ThemePreferences | null> => {
	try {
		return themeOf(await readPreferences())
	} catch {
		return null
	}
}

export const storeTheme = async (theme: ThemePreferences) => {
	try {
		await changePreferences((record) => ({ ...record, ...theme }))
	} catch {
		return
	}
}
