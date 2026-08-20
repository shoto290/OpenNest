import {
	activateLanguage,
	DEFAULT_LANGUAGE,
	type Language,
	languageOf,
} from "@workspace/ui/lib/i18n"

import { changePreferences, readPreferences } from "./preferences-queue"

/** The one key the first paint reads. The stored record is the source of truth, but
 * it only arrives over IPC: what `localStorage` holds is the copy the window reads
 * itself in before the host has answered. */
const LANGUAGE_KEY = "language"

/** What the app reads in, from what was chosen: the language itself when this build
 * ships its catalogue, the machine's own when nothing was chosen, and en when
 * neither has a catalogue. */
export const activeLanguageOf = (chosen: string | null): Language =>
	languageOf(chosen) ?? languageOf(navigator.language) ?? DEFAULT_LANGUAGE

/** A choice read in and mirrored at once. The mirror holds the name as it was
 * chosen rather than what it resolved to: a record holding none goes on following
 * the machine, next launch included. */
const adopt = (chosen: string | null) => {
	if (chosen === null) {
		localStorage.removeItem(LANGUAGE_KEY)
	} else {
		localStorage.setItem(LANGUAGE_KEY, chosen)
	}

	activateLanguage(activeLanguageOf(chosen))
}

/** The language the window opens in, then the one the record holds. The mirror is
 * read from storage, so the first string painted is already in the language that was
 * chosen rather than in en; the record it is a copy of catches up as soon as the
 * host answers, and a read the host refused leaves the window as it opened. */
export const startLanguage = async () => {
	activateLanguage(activeLanguageOf(localStorage.getItem(LANGUAGE_KEY)))

	try {
		adopt((await readPreferences()).language)
	} catch {
		return
	}
}

/** The language chosen, read in and written to the record. The record is written
 * whole, so the rest of it is read back and echoed in one turn of the queue every
 * other writer shares: a language must not clear the name, the picture, the scheme
 * or the palette. A refused call is dropped — the mirror already holds what is
 * read. */
export const storeLanguage = async (language: Language) => {
	adopt(language)

	try {
		await changePreferences((record) => ({ ...record, language }))
	} catch {
		return
	}
}
