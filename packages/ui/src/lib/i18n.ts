import i18next, { type i18n as I18nRuntime } from "i18next"
import { initReactI18next } from "react-i18next"

import { en } from "@workspace/ui/lib/i18n-en"

/** Types every key against the en catalogue, so a key the catalogue does not hold
 * fails the type check rather than rendering itself back to a reader. */
declare module "i18next" {
	interface CustomTypeOptions {
		defaultNS: "chat"
		resources: typeof en
	}
}

const i18n: I18nRuntime = i18next.createInstance()

/** Synchronous — the catalogue is bundled, so the first render already resolves.
 * The one language it carries is also the one every other falls back to. */
i18n.use(initReactI18next).init({
	lng: "en",
	fallbackLng: "en",
	defaultNS: "chat",
	resources: { en },
})

export { i18n }
