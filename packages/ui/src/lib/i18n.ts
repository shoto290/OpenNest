import i18next, { type i18n as I18nRuntime } from "i18next"
import { initReactI18next } from "react-i18next"

import { en } from "@workspace/ui/lib/i18n-en"
import { fr } from "@workspace/ui/lib/i18n-fr"

/** Every catalogue this build ships, which is also the list of languages it can be
 * read in: a language is a key of this object or it is not one at all. */
const catalogues = { en, fr }

export type Language = keyof typeof catalogues

const LANGUAGE_IDS = Object.keys(catalogues) as Language[]

/** The one language every other falls back to, and the one a name outside the
 * catalogues reads as. */
export const DEFAULT_LANGUAGE: Language = "en"

/** Types every key against the en catalogue, so a key the catalogue does not hold
 * fails the type check rather than rendering itself back to a reader. */
declare module "i18next" {
	interface CustomTypeOptions {
		defaultNS: "chat"
		resources: typeof en
	}
}

const i18n: I18nRuntime = i18next.createInstance()

/** Synchronous — the catalogues are bundled, so the first render already resolves.
 * A key one of them drops reads from the default language instead. */
i18n.use(initReactI18next).init({
	lng: DEFAULT_LANGUAGE,
	fallbackLng: DEFAULT_LANGUAGE,
	defaultNS: "chat",
	resources: catalogues,
	// React escapes what it renders. Escaping again turns a file name carrying an
	// ampersand into an entity the reader has to decode.
	interpolation: { escapeValue: false },
})

/** The catalogue a name asks for, or `null` when this build ships none for it. A
 * region is dropped before the lookup: `en-GB` is a machine set to English, and the
 * catalogues are named by language rather than by place. */
export const languageOf = (
	name: string | null | undefined,
): Language | null => {
	const tag = name?.split("-")[0]?.toLowerCase()

	return LANGUAGE_IDS.find((language) => language === tag) ?? null
}

/** Switches every string below the provider. The catalogues are bundled, so
 * nothing is fetched and the promise the runtime answers with has nothing left to
 * wait for. */
export const activateLanguage = (language: Language) => {
	void i18n.changeLanguage(language)
}

export { i18n }
