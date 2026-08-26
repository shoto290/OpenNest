import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import type { UserPreferences } from "./preferences-contract"
import type { MirroredPreferences } from "./preferences-mirror"
import {
	activeLanguageOf,
	applyLanguage,
	isMirrorKey,
	mirrorOf,
	readMirror,
	sameMirror,
	writeMirror,
} from "./preferences-mirror"

const RECORD: UserPreferences = {
	displayName: "Nyx",
	profilePicturePath: "/data/avatars/one.png",
	colorScheme: "dark",
	palette: "moss",
	language: "fr",
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
	sidebarWidth: null,
	lastBotId: null,
	lastSpaceId: null,
	lastBotIdBySpace: {},
}

const MIRRORED: MirroredPreferences = {
	colorScheme: "light",
	palette: "water",
	language: null,
	sidebarWidth: null,
	lastBotId: null,
	lastSpaceId: null,
	lastBotIdBySpace: {},
}

const createStorage = () => {
	const entries = new Map<string, string>()

	return {
		getItem: (key: string) => entries.get(key) ?? null,
		setItem: (key: string, value: string) => {
			entries.set(key, value)
		},
		removeItem: (key: string) => {
			entries.delete(key)
		},
	}
}

const machineReadingIn = (language: string) => {
	vi.stubGlobal("navigator", { language })
}

beforeEach(() => {
	vi.stubGlobal("localStorage", createStorage())
	machineReadingIn("en-US")
})

describe("the mirror", () => {
	it("holds the scheme, the palette and the language that were chosen", () => {
		writeMirror({ ...MIRRORED, language: "fr" })

		expect(localStorage.getItem("theme")).toBe("light")
		expect(localStorage.getItem("palette")).toBe("water")
		expect(localStorage.getItem("language")).toBe("fr")
		expect(readMirror()).toEqual({ ...MIRRORED, language: "fr" })
	})

	it("holds no language while the record follows the machine", () => {
		writeMirror({ ...MIRRORED, language: "fr" })

		writeMirror({ ...MIRRORED, language: null })

		expect(localStorage.getItem("language")).toBeNull()
		expect(readMirror().language).toBeNull()
	})

	it("reads the defaults when nothing has been mirrored", () => {
		expect(readMirror()).toEqual({
			colorScheme: "system",
			palette: "amber",
			language: null,
			sidebarWidth: null,
			lastBotId: null,
			lastSpaceId: null,
			lastBotIdBySpace: {},
		})
	})

	it("holds the bot last opened in each space", () => {
		writeMirror({
			...MIRRORED,
			lastBotIdBySpace: { vocca: "nyx", atlas: "iris" },
		})

		expect(localStorage.getItem("lastBotIdBySpace")).toBe(
			JSON.stringify({ vocca: "nyx", atlas: "iris" }),
		)
		expect(readMirror().lastBotIdBySpace).toEqual({
			vocca: "nyx",
			atlas: "iris",
		})
	})

	it("reads no bot per space when the mirror holds nothing readable", () => {
		localStorage.setItem("lastBotIdBySpace", "{not json")

		expect(readMirror().lastBotIdBySpace).toEqual({})
	})

	it("reads no bot per space when the mirror holds a shape it cannot serve", () => {
		localStorage.setItem("lastBotIdBySpace", JSON.stringify(["nyx"]))

		expect(readMirror().lastBotIdBySpace).toEqual({})
	})

	it("reads the default palette for a palette this build does not ship", () => {
		localStorage.setItem("theme", "dark")
		localStorage.setItem("palette", "chartreuse")

		expect(readMirror().palette).toBe("amber")
	})

	it("reads the default scheme for a scheme that is not one of the three", () => {
		localStorage.setItem("theme", "sepia")

		expect(readMirror().colorScheme).toBe("system")
	})

	it("holds the width the reader dragged the edge to", () => {
		writeMirror({ ...MIRRORED, sidebarWidth: 320 })

		expect(localStorage.getItem("sidebarWidth")).toBe("320")
		expect(readMirror().sidebarWidth).toBe(320)
	})

	it("holds no width once the record holds none", () => {
		writeMirror({ ...MIRRORED, sidebarWidth: 320 })

		writeMirror({ ...MIRRORED, sidebarWidth: null })

		expect(localStorage.getItem("sidebarWidth")).toBeNull()
		expect(readMirror().sidebarWidth).toBeNull()
	})

	it("reads no width for a width that is not a count of pixels", () => {
		localStorage.setItem("sidebarWidth", "wide")

		expect(readMirror().sidebarWidth).toBeNull()
	})

	it("holds the bot whose conversation was left open", () => {
		writeMirror({ ...MIRRORED, lastBotId: "nyx" })

		expect(localStorage.getItem("lastBotId")).toBe("nyx")
		expect(readMirror().lastBotId).toBe("nyx")
	})

	it("holds the space the reader was left in", () => {
		writeMirror({ ...MIRRORED, lastSpaceId: "vocca" })

		expect(localStorage.getItem("lastSpaceId")).toBe("vocca")
		expect(readMirror().lastSpaceId).toBe("vocca")
	})

	it("reads no language for a catalogue this build does not ship", () => {
		localStorage.setItem("language", "br")

		expect(readMirror().language).toBeNull()
	})
})

describe("the record the host holds", () => {
	it("is read down to the fields the mirror serves", () => {
		expect(
			mirrorOf({
				...RECORD,
				sidebarWidth: 320,
				lastBotId: "nyx",
				lastSpaceId: "vocca",
				lastBotIdBySpace: {},
			}),
		).toEqual({
			colorScheme: "dark",
			palette: "moss",
			language: "fr",
			sidebarWidth: 320,
			lastBotId: "nyx",
			lastSpaceId: "vocca",
			lastBotIdBySpace: {},
		})
	})

	it("is read with no bot per space when the record leaves the map out", () => {
		const { lastBotIdBySpace, ...older } = RECORD

		expect(mirrorOf(older as UserPreferences).lastBotIdBySpace).toEqual({})
	})

	it("is read on its defaults for the values this build does not ship", () => {
		expect(
			mirrorOf({ ...RECORD, palette: "chartreuse", language: "br" }),
		).toEqual({
			colorScheme: "dark",
			palette: "amber",
			language: null,
			sidebarWidth: null,
			lastBotId: null,
			lastSpaceId: null,
			lastBotIdBySpace: {},
		})
	})
})

describe("the active language", () => {
	it("is the one that was chosen when this build ships its catalogue", () => {
		machineReadingIn("fr-FR")

		expect(activeLanguageOf("en")).toBe("en")
	})

	it("is the machine's own when nothing was chosen", () => {
		machineReadingIn("en-GB")

		expect(activeLanguageOf(null)).toBe("en")
	})

	it("is en when neither the choice nor the machine has a catalogue", () => {
		machineReadingIn("br-FR")

		expect(activeLanguageOf("br")).toBe("en")
	})

	it("is read in as soon as the mirror is applied", () => {
		machineReadingIn("fr-FR")

		applyLanguage(null)

		expect(i18n.language).toBe("fr")
	})
})

describe("isMirrorKey", () => {
	it("tells the keys the mirror holds from the rest of the storage", () => {
		expect(isMirrorKey("theme")).toBe(true)
		expect(isMirrorKey("palette")).toBe(true)
		expect(isMirrorKey("language")).toBe(true)
		expect(isMirrorKey("sidebarWidth")).toBe(true)
		expect(isMirrorKey("lastBotId")).toBe(true)
		expect(isMirrorKey("lastSpaceId")).toBe(true)
		expect(isMirrorKey("conversations")).toBe(false)
		expect(isMirrorKey(null)).toBe(false)
	})
})

describe("sameMirror", () => {
	it("tells a pair apart on any axis", () => {
		const mirrored = {
			colorScheme: "dark",
			palette: "moss",
			language: "fr",
			sidebarWidth: 320,
			lastBotId: "nyx",
			lastSpaceId: "vocca",
			lastBotIdBySpace: {},
		} as const

		expect(sameMirror(mirrored, { ...mirrored })).toBe(true)
		expect(sameMirror(mirrored, { ...mirrored, palette: "coral" })).toBe(false)
		expect(sameMirror(mirrored, { ...mirrored, colorScheme: "light" })).toBe(
			false,
		)
		expect(sameMirror(mirrored, { ...mirrored, language: null })).toBe(false)
		expect(sameMirror(mirrored, { ...mirrored, sidebarWidth: 256 })).toBe(false)
		expect(sameMirror(mirrored, { ...mirrored, lastBotId: null })).toBe(false)
		expect(sameMirror(mirrored, { ...mirrored, lastSpaceId: null })).toBe(false)
		expect(
			sameMirror(mirrored, { ...mirrored, lastBotIdBySpace: { vocca: "nyx" } }),
		).toBe(false)
	})
})
