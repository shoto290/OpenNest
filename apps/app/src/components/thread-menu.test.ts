// @vitest-environment happy-dom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import type { MentionBot } from "@workspace/ui/components/prompt-mention-menu"
import type { RosterBot } from "@workspace/ui/components/roster"

import { ThreadComposer } from "@/components/thread-composer"
import {
	botThreadMenu,
	conversationThreadMenu,
	promptWithPickedMention,
	type ThreadMenuWiring,
} from "@/components/thread-menu"
import type { StagedAttachment } from "@/lib/chat/attachments"

const NO_ATTACHMENTS: StagedAttachment[] = []

const COMMANDS = [
	{ name: "review", description: "Review the diff" },
	{ name: "ship", description: "Ship it" },
]

const BOTS: RosterBot[] = [
	{ id: "nyx", name: "Nyx" },
	{ id: "orb", name: "Orb" },
]

const OUTSIDE_BOT: MentionBot = { id: "vela", name: "Vela", isOutside: true }

const WITH_OUTSIDE: MentionBot[] = [...BOTS, OUTSIDE_BOT]

const composerWith = (wiring: ThreadMenuWiring): ReactNode =>
	createElement(ThreadComposer, {
		attachments: NO_ATTACHMENTS,
		canAttach: true,
		composerRef: { current: null },
		isDisabled: false,
		isDropTarget: false,
		menu: wiring.menu,
		onAttach: () => undefined,
		onPromptChange: () => undefined,
		onRemoveAttachment: () => undefined,
		onSubmitPrompt: () => Promise.resolve(true),
		placeholder: "Ask Nyx to do something…",
		queryIn: wiring.queryIn,
		readDraft: () => "",
	})

const field = () => screen.getByRole("textbox") as HTMLTextAreaElement

const type = (text: string) => {
	fireEvent.change(field(), { target: { value: text } })
}

const pick = (name: string | RegExp) => {
	fireEvent.click(screen.getByRole("option", { name }))
}

describe("botThreadMenu", () => {
	afterEach(cleanup)

	it("offers the thread commands once the reader opens a command draft", () => {
		render(
			composerWith(botThreadMenu({ commands: COMMANDS, isOverlayOpen: false })),
		)

		type("/re")

		expect(screen.getByRole("option", { name: /\/review/ })).toBeTruthy()
	})

	it("writes the picked command into the prompt", () => {
		render(
			composerWith(botThreadMenu({ commands: COMMANDS, isOverlayOpen: false })),
		)

		type("/re")
		pick(/\/review/)

		expect(field().value).toBe("/review ")
	})

	it("keeps the menu closed while the overlay is open", () => {
		render(
			composerWith(botThreadMenu({ commands: COMMANDS, isOverlayOpen: true })),
		)

		type("/re")

		expect(screen.queryByRole("listbox")).toBeNull()
	})
})

describe("conversationThreadMenu", () => {
	afterEach(cleanup)

	it("offers the present companions and marks the lead", () => {
		render(composerWith(conversationThreadMenu({ bots: BOTS, leadId: "orb" })))

		type("@")

		expect(screen.getByRole("option", { name: "Nyx" })).toBeTruthy()
		expect(screen.getByRole("option", { name: "Orb Lead" })).toBeTruthy()
	})

	it("writes the picked companion name into the prompt", () => {
		render(composerWith(conversationThreadMenu({ bots: BOTS, leadId: "orb" })))

		type("hey @n")
		pick("Nyx")

		expect(field().value).toBe("hey @Nyx ")
	})

	it("leaves the prompt untouched when no present companion carries the picked id", () => {
		expect(promptWithPickedMention("hey @n", BOTS, "ghost")).toBe("hey @n")
	})

	it("seats nobody when a companion already seated is picked", () => {
		const onSeat = vi.fn(() => Promise.resolve(true))
		render(
			composerWith(
				conversationThreadMenu({ bots: WITH_OUTSIDE, leadId: "orb", onSeat }),
			),
		)

		type("hey @n")
		pick("Nyx")

		expect(onSeat).not.toHaveBeenCalled()
		expect(field().value).toBe("hey @Nyx ")
	})

	it("seats a companion marked outside before writing its mention", async () => {
		const onSeat = vi.fn(() => Promise.resolve(true))
		render(
			composerWith(
				conversationThreadMenu({ bots: WITH_OUTSIDE, leadId: "orb", onSeat }),
			),
		)

		type("hey @ve")
		pick(/Vela/)

		expect(onSeat).toHaveBeenCalledWith("vela")
		await waitFor(() => expect(field().value).toBe("hey @Vela "))
	})

	it("leaves the prompt alone when seating the companion fails", async () => {
		const onSeat = vi.fn(() => Promise.resolve(false))
		render(
			composerWith(
				conversationThreadMenu({ bots: WITH_OUTSIDE, leadId: "orb", onSeat }),
			),
		)

		type("hey @ve")
		pick(/Vela/)

		await waitFor(() => expect(onSeat).toHaveBeenCalledWith("vela"))
		expect(field().value).toBe("hey @ve")
	})
})
