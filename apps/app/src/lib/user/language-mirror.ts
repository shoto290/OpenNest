import {
	activateLanguage,
	DEFAULT_LANGUAGE,
	type Language,
	languageOf,
} from "@workspace/ui/lib/i18n"

import { changePreferences, readPreferences } from "./preferences-queue"

const LANGUAGE_KEY = "language"

export const chosenLanguage = (): Language | null =>
	languageOf(localStorage.getItem(LANGUAGE_KEY))

export const activeLanguageOf = (chosen: string | null): Language =>
	languageOf(chosen) ?? languageOf(navigator.language) ?? DEFAULT_LANGUAGE

const adopt = (chosen: string | null) => {
	if (chosen === null) {
		localStorage.removeItem(LANGUAGE_KEY)
	} else {
		localStorage.setItem(LANGUAGE_KEY, chosen)
	}

	activateLanguage(activeLanguageOf(chosen))
}

export const startLanguage = async () => {
	activateLanguage(activeLanguageOf(localStorage.getItem(LANGUAGE_KEY)))

	try {
		adopt((await readPreferences()).language)
	} catch {
		return
	}
}

export const storeLanguage = async (language: Language | null) => {
	adopt(language)

	try {
		await changePreferences((record) => ({ ...record, language }))
	} catch {
		return
	}
}
