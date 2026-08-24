import i18next, { type i18n as I18nRuntime } from "i18next"
import { initReactI18next } from "react-i18next"

import { en } from "@workspace/ui/lib/i18n-en"
import { fr } from "@workspace/ui/lib/i18n-fr"

const catalogues = { en, fr }

export type Language = keyof typeof catalogues

export const LANGUAGE_IDS = Object.keys(catalogues) as Language[]

export const LANGUAGE_NAMES: Record<Language, string> = {
	en: "English",
	fr: "Français",
}

export const DEFAULT_LANGUAGE: Language = "en"

declare module "i18next" {
	interface CustomTypeOptions {
		defaultNS: "chat"
		resources: typeof en
	}
}

const i18n: I18nRuntime = i18next.createInstance()

i18n.use(initReactI18next).init({
	lng: DEFAULT_LANGUAGE,
	fallbackLng: DEFAULT_LANGUAGE,
	defaultNS: "chat",
	resources: catalogues,
	interpolation: { escapeValue: false },
})

export const languageOf = (
	name: string | null | undefined,
): Language | null => {
	const tag = name?.split("-")[0]?.toLowerCase()

	return LANGUAGE_IDS.find((language) => language === tag) ?? null
}

export const activateLanguage = (language: Language) => {
	void i18n.changeLanguage(language)
}

export { i18n }
