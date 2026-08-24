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
const SIDEBAR_WIDTH_KEY = "sidebarWidth"
const LAST_BOT_KEY = "lastBotId"

const COLOR_SCHEMES: ColorScheme[] = ["system", "light", "dark"]

const DEFAULT_COLOR_SCHEME: ColorScheme = "system"

export type MirroredPreferences = {
	colorScheme: ColorScheme
	palette: Palette
	language: Language | null
	sidebarWidth: number | null
	lastBotId: string | null
}

const colorSchemeOf = (value: string | null): ColorScheme =>
	COLOR_SCHEMES.find((scheme) => scheme === value) ?? DEFAULT_COLOR_SCHEME

const paletteOf = (value: string | null): Palette =>
	PALETTE_IDS.find((palette) => palette === value) ?? DEFAULT_PALETTE

const widthOf = (value: string | null): number | null => {
	const width = Number.parseInt(value ?? "", 10)
	return Number.isNaN(width) ? null : width
}

export const activeLanguageOf = (chosen: string | null): Language =>
	languageOf(chosen) ?? languageOf(navigator.language) ?? DEFAULT_LANGUAGE

export const applyLanguage = (chosen: Language | null) => {
	activateLanguage(activeLanguageOf(chosen))
}

export const mirrorOf = (record: UserPreferences): MirroredPreferences => ({
	colorScheme: colorSchemeOf(record.colorScheme),
	palette: paletteOf(record.palette),
	language: languageOf(record.language),
	sidebarWidth: record.sidebarWidth ?? null,
	lastBotId: record.lastBotId ?? null,
})

export const sameMirror = (
	one: MirroredPreferences,
	other: MirroredPreferences,
) =>
	one.colorScheme === other.colorScheme &&
	one.palette === other.palette &&
	one.language === other.language &&
	one.sidebarWidth === other.sidebarWidth &&
	one.lastBotId === other.lastBotId

export const readMirror = (): MirroredPreferences => ({
	colorScheme: colorSchemeOf(localStorage.getItem(COLOR_SCHEME_KEY)),
	palette: paletteOf(localStorage.getItem(PALETTE_KEY)),
	language: languageOf(localStorage.getItem(LANGUAGE_KEY)),
	sidebarWidth: widthOf(localStorage.getItem(SIDEBAR_WIDTH_KEY)),
	lastBotId: localStorage.getItem(LAST_BOT_KEY),
})

const keep = (key: string, value: string | number | null) => {
	if (value === null) {
		localStorage.removeItem(key)
		return
	}

	localStorage.setItem(key, String(value))
}

export const writeMirror = (mirrored: MirroredPreferences) => {
	localStorage.setItem(COLOR_SCHEME_KEY, mirrored.colorScheme)
	localStorage.setItem(PALETTE_KEY, mirrored.palette)
	keep(LANGUAGE_KEY, mirrored.language)
	keep(SIDEBAR_WIDTH_KEY, mirrored.sidebarWidth)
	keep(LAST_BOT_KEY, mirrored.lastBotId)
}

const MIRROR_KEYS = [
	COLOR_SCHEME_KEY,
	PALETTE_KEY,
	LANGUAGE_KEY,
	SIDEBAR_WIDTH_KEY,
	LAST_BOT_KEY,
]

export const isMirrorKey = (key: string | null) =>
	MIRROR_KEYS.some((mirrored) => mirrored === key)
