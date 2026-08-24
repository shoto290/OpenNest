import {
	activateLanguage,
	DEFAULT_LANGUAGE,
	type Language,
	languageOf,
} from "@workspace/ui/lib/i18n"
import {
	DEFAULT_PALETTE,
	PALETTE_IDS,
	type Palette,
} from "@workspace/ui/lib/palettes"

import type { ColorScheme, UserPreferences } from "./preferences-contract"

const COLOR_SCHEME_KEY = "theme"
const PALETTE_KEY = "palette"
const LANGUAGE_KEY = "language"

const COLOR_SCHEMES: ColorScheme[] = ["system", "light", "dark"]

const DEFAULT_COLOR_SCHEME: ColorScheme = "system"

export type MirroredPreferences = {
	colorScheme: ColorScheme
	palette: Palette
	language: Language | null
}

const colorSchemeOf = (value: string | null): ColorScheme =>
	COLOR_SCHEMES.find((scheme) => scheme === value) ?? DEFAULT_COLOR_SCHEME

const paletteOf = (value: string | null): Palette =>
	PALETTE_IDS.find((palette) => palette === value) ?? DEFAULT_PALETTE

export const activeLanguageOf = (chosen: string | null): Language =>
	languageOf(chosen) ?? languageOf(navigator.language) ?? DEFAULT_LANGUAGE

export const applyLanguage = (chosen: Language | null) => {
	activateLanguage(activeLanguageOf(chosen))
}

export const mirrorOf = (record: UserPreferences): MirroredPreferences => ({
	colorScheme: colorSchemeOf(record.colorScheme),
	palette: paletteOf(record.palette),
	language: languageOf(record.language),
})

export const sameMirror = (
	one: MirroredPreferences,
	other: MirroredPreferences,
) =>
	one.colorScheme === other.colorScheme &&
	one.palette === other.palette &&
	one.language === other.language

export const readMirror = (): MirroredPreferences => ({
	colorScheme: colorSchemeOf(localStorage.getItem(COLOR_SCHEME_KEY)),
	palette: paletteOf(localStorage.getItem(PALETTE_KEY)),
	language: languageOf(localStorage.getItem(LANGUAGE_KEY)),
})

export const writeMirror = (mirrored: MirroredPreferences) => {
	localStorage.setItem(COLOR_SCHEME_KEY, mirrored.colorScheme)
	localStorage.setItem(PALETTE_KEY, mirrored.palette)

	if (mirrored.language === null) {
		localStorage.removeItem(LANGUAGE_KEY)
		return
	}

	localStorage.setItem(LANGUAGE_KEY, mirrored.language)
}

export const isMirrorKey = (key: string | null) =>
	key === COLOR_SCHEME_KEY || key === PALETTE_KEY || key === LANGUAGE_KEY
