// @vitest-environment happy-dom

import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, expect, it } from "vitest"

import "@workspace/ui/lib/i18n"
import {
	NoticeSurface,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"

import { createFakeNotificationPort } from "./fake-notification-port"
import type { NotificationPort } from "./notification-port"
import { startNotificationSource } from "./notification-source"

import { initialChatState } from "../chat/chat-state"

const CLICK_FAILURE_TITLE =
	"Clicking a notification will no longer open its conversation"

const SWITCHES = {
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
}

const idleChat = {
	stateFor: () => initialChatState,
	subscribe: () => () => undefined,
}

const idleRuntimes = {
	heldFor: () => null,
	subscribe: () => () => undefined,
}

const emptyRoster = {
	getState: () => ({ bots: [], conversations: [] }),
	spaceOfBot: () => undefined,
	spaceOfConversation: () => undefined,
	select: () => undefined,
	selectConversation: () => undefined,
}

const watchAlongside = async (notifications: NotificationPort) => {
	render(createElement(NoticeSurface))

	startNotificationSource({
		chat: idleChat,
		runtimes: idleRuntimes,
		roster: emptyRoster,
		spaces: { select: () => undefined },
		notifications,
		switches: () => SWITCHES,
		hasFocus: () => false,
		watchFocus: async () => () => undefined,
		raiseWindow: () => undefined,
		playChime: () => undefined,
		reportFailure: raiseFailureNotice,
	})
	await Promise.resolve()
}

const noticesOnScreen = () => {
	const surface = screen.getByRole("region", { name: "Notices" })

	return [
		...within(surface).queryAllByRole("alertdialog", { hidden: true }),
		...within(surface).queryAllByRole("dialog", { hidden: true }),
	]
}

afterEach(() => {
	cleanup()
})

it("shows the reader why clicking a notification stopped working", async () => {
	const notifications = createFakeNotificationPort()
	notifications.onActivate = () => Promise.reject(new Error("no listener"))

	await watchAlongside(notifications)

	await waitFor(() => {
		expect(noticesOnScreen()).toHaveLength(1)
	})

	const [notice] = noticesOnScreen()

	expect(within(notice).getByText(CLICK_FAILURE_TITLE)).toBeTruthy()
	expect(within(notice).getByText("no listener")).toBeTruthy()
})

it("leaves the surface empty while every subscription holds", async () => {
	await watchAlongside(createFakeNotificationPort())

	expect(noticesOnScreen()).toEqual([])
})
