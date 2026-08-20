import { describe, expect, it } from "vitest"

import {
	activateLanguage,
	DEFAULT_LANGUAGE,
	i18n,
	languageOf,
} from "@workspace/ui/lib/i18n"

describe("languageOf", () => {
	it("answers the catalogue a name asks for", () => {
		expect(languageOf("en")).toBe("en")
	})

	it("drops the region and the case a machine names its locale with", () => {
		expect(languageOf("en-GB")).toBe("en")
		expect(languageOf("EN")).toBe("en")
	})

	it("answers nothing for a language this build ships no catalogue for", () => {
		expect(languageOf("fr")).toBeNull()
		expect(languageOf("fr-CA")).toBeNull()
	})

	it("answers nothing when there is no name to look up", () => {
		expect(languageOf(null)).toBeNull()
		expect(languageOf(undefined)).toBeNull()
		expect(languageOf("")).toBeNull()
	})
})

describe("the runtime", () => {
	it("opens in the default language and reads an activated one back", () => {
		expect(i18n.language).toBe(DEFAULT_LANGUAGE)

		activateLanguage("en")

		expect(i18n.language).toBe("en")
	})
})
