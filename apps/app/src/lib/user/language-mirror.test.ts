import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import {
	activeLanguageOf,
	chosenLanguage,
	startLanguage,
	storeLanguage,
} from "./language-mirror"
import type { UserPreferences } from "./preferences-contract"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

const RECORD: UserPreferences = {
	displayName: "Nyx",
	profilePicturePath: "/data/avatars/one.png",
	colorScheme: "dark",
	palette: "moss",
	language: null,
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
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
	hostInvoke.mockReset()
	hostInvoke.mockResolvedValue(RECORD)
	vi.stubGlobal("localStorage", createStorage())
	machineReadingIn("en-US")
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
})

describe("the language chosen so far", () => {
	it("is the one the mirror holds", () => {
		localStorage.setItem("language", "fr")

		expect(chosenLanguage()).toBe("fr")
	})

	it("is none while the record follows the machine", () => {
		machineReadingIn("fr-FR")

		expect(chosenLanguage()).toBeNull()
	})
})

describe("the launch", () => {
	it("opens in the mirrored language, before the host has answered", async () => {
		localStorage.setItem("language", "en")

		const opening = startLanguage()

		expect(i18n.language).toBe("en")
		await opening
	})

	it("opens in the machine's own when nothing has been mirrored", async () => {
		machineReadingIn("fr-FR")

		const opening = startLanguage()

		expect(i18n.language).toBe("fr")
		await opening
	})

	it("follows the record once the host answers", async () => {
		hostInvoke.mockResolvedValue({ ...RECORD, language: "en" })

		await startLanguage()

		expect(localStorage.getItem("language")).toBe("en")
		expect(i18n.language).toBe("en")
	})

	it("mirrors no language when the record holds none", async () => {
		localStorage.setItem("language", "en")

		await startLanguage()

		expect(localStorage.getItem("language")).toBeNull()
	})

	it("leaves the window reading as it opened when the host refuses", async () => {
		hostInvoke.mockRejectedValue({
			kind: "unavailable",
			failure: { kind: "appDataDir" },
		})
		localStorage.setItem("language", "en")

		await expect(startLanguage()).resolves.toBeUndefined()

		expect(localStorage.getItem("language")).toBe("en")
		expect(i18n.language).toBe("en")
	})
})

describe("the language chosen", () => {
	it("is mirrored and read in", async () => {
		await storeLanguage("en")

		expect(localStorage.getItem("language")).toBe("en")
		expect(i18n.language).toBe("en")
	})

	it("is written to the record, echoing the rest of it", async () => {
		await storeLanguage("en")

		expect(hostInvoke).toHaveBeenLastCalledWith("user_set_preferences", {
			preferences: { ...RECORD, language: "en" },
		})
	})

	it("is forgotten when the reader hands the choice back", async () => {
		machineReadingIn("fr-FR")
		await storeLanguage("en")

		await storeLanguage(null)

		expect(localStorage.getItem("language")).toBeNull()
		expect(i18n.language).toBe("fr")
		expect(hostInvoke).toHaveBeenLastCalledWith("user_set_preferences", {
			preferences: { ...RECORD, language: null },
		})
	})

	it("drops a write the host refused", async () => {
		hostInvoke.mockRejectedValue({
			kind: "storage",
			failure: { kind: "sqlite", detail: "disk I/O error" },
		})

		await expect(storeLanguage("en")).resolves.toBeUndefined()
	})
})
