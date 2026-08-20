import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { UserPreferences } from "./preferences-contract"
import {
	isMirrorKey,
	readMirror,
	readStoredTheme,
	sameTheme,
	storeTheme,
	writeMirror,
} from "./theme-mirror"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

const RECORD: UserPreferences = {
	displayName: "Nyx",
	profilePicturePath: "/data/avatars/one.png",
	colorScheme: "dark",
	palette: "moss",
	language: "fr",
}

const createStorage = () => {
	const entries = new Map<string, string>()

	return {
		getItem: (key: string) => entries.get(key) ?? null,
		setItem: (key: string, value: string) => {
			entries.set(key, value)
		},
	}
}

beforeEach(() => {
	hostInvoke.mockReset()
	hostInvoke.mockResolvedValue(RECORD)
	vi.stubGlobal("localStorage", createStorage())
})

describe("the mirror", () => {
	it("holds the scheme and the palette that were chosen", () => {
		writeMirror({ colorScheme: "light", palette: "water" })

		expect(localStorage.getItem("theme")).toBe("light")
		expect(localStorage.getItem("palette")).toBe("water")
		expect(readMirror()).toEqual({ colorScheme: "light", palette: "water" })
	})

	it("reads the defaults when nothing has been mirrored", () => {
		expect(readMirror()).toEqual({ colorScheme: "system", palette: "amber" })
	})

	it("reads the default palette for a palette this build does not ship", () => {
		localStorage.setItem("theme", "dark")
		localStorage.setItem("palette", "chartreuse")

		expect(readMirror()).toEqual({ colorScheme: "dark", palette: "amber" })
	})

	it("reads the default scheme for a scheme that is not one of the three", () => {
		localStorage.setItem("theme", "sepia")

		expect(readMirror().colorScheme).toBe("system")
	})
})

describe("the stored record", () => {
	it("reads the scheme and the palette the host holds", async () => {
		expect(await readStoredTheme()).toEqual({
			colorScheme: "dark",
			palette: "moss",
		})
	})

	it("reads nothing when the host refuses", async () => {
		hostInvoke.mockRejectedValue({
			kind: "unavailable",
			failure: { kind: "appDataDir" },
		})

		expect(await readStoredTheme()).toBeNull()
	})

	it("writes the two fields and echoes the rest of the record", async () => {
		await storeTheme({ colorScheme: "light", palette: "coral" })

		expect(hostInvoke).toHaveBeenLastCalledWith("user_set_preferences", {
			preferences: {
				...RECORD,
				colorScheme: "light",
				palette: "coral",
			},
		})
	})

	it("drops a write the host refused", async () => {
		hostInvoke.mockRejectedValue({
			kind: "storage",
			failure: { kind: "sqlite", detail: "disk I/O error" },
		})

		await expect(
			storeTheme({ colorScheme: "dark", palette: "slate" }),
		).resolves.toBeUndefined()
	})
})

describe("isMirrorKey", () => {
	it("tells the keys the mirror holds from the rest of the storage", () => {
		expect(isMirrorKey("theme")).toBe(true)
		expect(isMirrorKey("palette")).toBe(true)
		expect(isMirrorKey("conversations")).toBe(false)
		expect(isMirrorKey(null)).toBe(false)
	})
})

describe("sameTheme", () => {
	it("tells a pair apart on either axis", () => {
		const theme = { colorScheme: "dark", palette: "moss" } as const

		expect(sameTheme(theme, { ...theme })).toBe(true)
		expect(sameTheme(theme, { ...theme, palette: "coral" })).toBe(false)
		expect(sameTheme(theme, { ...theme, colorScheme: "light" })).toBe(false)
	})
})
