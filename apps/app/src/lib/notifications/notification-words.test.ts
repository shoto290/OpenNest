import { afterEach, describe, expect, it } from "vitest"

import { activateLanguage } from "@workspace/ui/lib/i18n"

import { notificationWordsFor } from "./notification-words"

afterEach(() => {
	activateLanguage("en")
})

describe("notificationWordsFor", () => {
	it("titles the notification with the name it was given", () => {
		expect(notificationWordsFor({ name: "Nyx", event: "question" }).title).toBe(
			"Nyx",
		)
	})

	it("reads each event from the en catalogue", () => {
		expect(notificationWordsFor({ name: "Nyx", event: "question" }).body).toBe(
			"Asked you a question",
		)
		expect(
			notificationWordsFor({ name: "Nyx", event: "permission" }).body,
		).toBe("Wants your permission")
		expect(
			notificationWordsFor({ name: "Nyx", event: "finishedTurn" }).body,
		).toBe("Finished its turn")
	})

	it("reads each event from the fr catalogue", () => {
		activateLanguage("fr")

		expect(notificationWordsFor({ name: "Nyx", event: "question" }).body).toBe(
			"Vous a posé une question",
		)
		expect(
			notificationWordsFor({ name: "Nyx", event: "permission" }).body,
		).toBe("Demande votre permission")
		expect(
			notificationWordsFor({ name: "Nyx", event: "finishedTurn" }).body,
		).toBe("A terminé son tour")
	})
})
