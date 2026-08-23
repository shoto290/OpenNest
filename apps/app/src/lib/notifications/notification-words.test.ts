import { afterEach, describe, expect, it } from "vitest"

import { activateLanguage } from "@workspace/ui/lib/i18n"

import { notificationWordsFor } from "./notification-words"

afterEach(() => {
	activateLanguage("en")
})

describe("notificationWordsFor", () => {
	it("titles the notification with the bot's name", () => {
		expect(
			notificationWordsFor({ botName: "Nyx", event: "question" }).title,
		).toBe("Nyx")
	})

	it("reads each event from the en catalogue", () => {
		expect(
			notificationWordsFor({ botName: "Nyx", event: "question" }).body,
		).toBe("Asked you a question")
		expect(
			notificationWordsFor({ botName: "Nyx", event: "permission" }).body,
		).toBe("Wants your permission")
		expect(
			notificationWordsFor({ botName: "Nyx", event: "finishedTurn" }).body,
		).toBe("Finished its turn")
	})

	it("reads each event from the fr catalogue", () => {
		activateLanguage("fr")

		expect(
			notificationWordsFor({ botName: "Nyx", event: "question" }).body,
		).toBe("Vous a posé une question")
		expect(
			notificationWordsFor({ botName: "Nyx", event: "permission" }).body,
		).toBe("Demande votre permission")
		expect(
			notificationWordsFor({ botName: "Nyx", event: "finishedTurn" }).body,
		).toBe("A terminé son tour")
	})
})
