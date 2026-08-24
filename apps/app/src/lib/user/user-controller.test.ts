import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { UserPreferences } from "./preferences-contract"
import { storeTheme } from "./theme-mirror"
import { createUserController } from "./user-controller"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

const DEFAULTS: UserPreferences = {
	displayName: "",
	profilePicturePath: null,
	colorScheme: "system",
	palette: "amber",
	language: null,
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
}

const WORN = "/data/avatars/worn.png"

const ALL_NOTIFIED = {
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
}

const aHost = (record: UserPreferences = DEFAULTS) => {
	let held = record

	hostInvoke.mockImplementation((command, args) => {
		if (command === "user_set_preferences") {
			held = (args as { preferences: UserPreferences }).preferences
		}
		if (command === "user_set_profile_picture") {
			held = { ...held, profilePicturePath: WORN }
		}
		return Promise.resolve(held)
	})

	return () => held
}

const aPicture = () =>
	({
		arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
	}) as File

const loaded = async () => {
	const controller = createUserController()
	await controller.load()
	return controller
}

beforeEach(() => {
	hostInvoke.mockReset()
	vi.stubGlobal("localStorage", {
		getItem: () => null,
		setItem: () => undefined,
	})
})

describe("the reader's own record", () => {
	it("opens on the name and the picture the host holds", async () => {
		aHost({ ...DEFAULTS, displayName: "Nyx", profilePicturePath: WORN })

		const controller = await loaded()

		expect(controller.getState().profile).toEqual({
			...ALL_NOTIFIED,
			displayName: "Nyx",
			profilePicturePath: WORN,
		})
	})

	it("shows a name on the keystroke and writes the record whole", async () => {
		const host = aHost({ ...DEFAULTS, colorScheme: "dark", palette: "moss" })
		const controller = await loaded()

		controller.rename("Ny")
		controller.rename("Nyx")

		expect(controller.getState().profile.displayName).toBe("Nyx")
		await vi.waitFor(() =>
			expect(host()).toEqual({
				...DEFAULTS,
				displayName: "Nyx",
				colorScheme: "dark",
				palette: "moss",
			}),
		)
	})

	it("wears the picture the host answered with", async () => {
		aHost()
		const controller = await loaded()

		await controller.uploadPicture(aPicture())

		expect(hostInvoke).toHaveBeenCalledWith("user_set_profile_picture", {
			bytes: new Uint8Array([1, 2, 3]),
		})
		expect(controller.getState().profile.profilePicturePath).toBe(WORN)
	})

	it("takes the picture off the record the host holds", async () => {
		const host = aHost()
		const controller = await loaded()
		await controller.uploadPicture(aPicture())

		await controller.removePicture()

		expect(host().profilePicturePath).toBeNull()
		expect(controller.getState().profile.profilePicturePath).toBeNull()
	})

	it("keeps showing what the host last answered with when a write is refused", async () => {
		aHost({ ...DEFAULTS, displayName: "Nyx" })
		const controller = await loaded()
		hostInvoke.mockRejectedValue({
			kind: "storage",
			failure: { kind: "sqlite", detail: "disk I/O error" },
		})

		controller.rename("Nix")

		await vi.waitFor(() =>
			expect(controller.getState().profile.displayName).toBe("Nyx"),
		)
	})

	it("shows the switch on the press and writes the record whole", async () => {
		const host = aHost({ ...DEFAULTS, displayName: "Nyx", palette: "moss" })
		const controller = await loaded()

		const written = controller.setNotification({
			field: "notifyOnPermission",
			isEnabled: false,
		})

		expect(controller.getState().profile.notifyOnPermission).toBe(false)
		await written
		expect(host()).toEqual({
			...DEFAULTS,
			displayName: "Nyx",
			palette: "moss",
			notifyOnPermission: false,
		})
	})

	it("puts a switch back on what the host last answered when its write is refused", async () => {
		aHost()
		const controller = await loaded()
		hostInvoke.mockRejectedValue({
			kind: "storage",
			failure: { kind: "sqlite", detail: "disk I/O error" },
		})

		await controller.setNotification({
			field: "notifyOnQuestion",
			isEnabled: false,
		})

		expect(controller.getState().profile.notifyOnQuestion).toBe(true)
	})

	it("holds a theme chosen between a keystroke's read and its write", async () => {
		const host = aHost({ ...DEFAULTS, displayName: "Nyx" })
		const controller = await loaded()

		controller.rename("Nyxie")
		await storeTheme({ colorScheme: "light", palette: "coral" })

		await vi.waitFor(() =>
			expect(host()).toEqual({
				...DEFAULTS,
				displayName: "Nyxie",
				colorScheme: "light",
				palette: "coral",
			}),
		)
	})
})

describe("the settings the chip opens", () => {
	it("stand open until they are closed, and nothing else moves", async () => {
		aHost()
		const controller = await loaded()

		controller.setSettingsOpen(true)
		expect(controller.getState().isSettingsOpen).toBe(true)

		controller.setSettingsOpen(false)
		expect(controller.getState().isSettingsOpen).toBe(false)
	})
})
