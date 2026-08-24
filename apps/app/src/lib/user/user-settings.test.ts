import { describe, expect, it } from "vitest"

import type { UserProfile } from "./user-controller"
import { toNotificationChange, toUserSettingsValue } from "./user-settings"

const PROFILE: UserProfile = {
	displayName: "Nyx",
	profilePicturePath: null,
	notifyOnQuestion: true,
	notifyOnPermission: false,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
}

const THEME = { colorScheme: "dark", palette: "moss" } as const

const shown = (profile: UserProfile = PROFILE) =>
	toUserSettingsValue(profile, THEME)

describe("the switches the dialog draws", () => {
	it("stands each one where the record holds it", () => {
		expect(shown().notifications).toEqual({
			question: true,
			permission: false,
			turn: true,
			sound: true,
		})
	})

	it("reads the sound the dialog flipped as the field the record names", () => {
		const silenced = shown({ ...PROFILE, notifyWithSound: false })

		expect(toNotificationChange(silenced, shown())).toEqual({
			field: "notifyWithSound",
			isEnabled: false,
		})
	})

	it("reads a flipped switch as the field the record names", () => {
		const flipped = shown({ ...PROFILE, notifyOnFinishedTurn: false })

		expect(toNotificationChange(flipped, shown())).toEqual({
			field: "notifyOnFinishedTurn",
			isEnabled: false,
		})
	})

	it("reads an edit of another field as no switch at all", () => {
		const renamed = shown({ ...PROFILE, displayName: "Nyxie" })

		expect(toNotificationChange(renamed, shown())).toBeNull()
	})
})
