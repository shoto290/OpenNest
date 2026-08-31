// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"

import "@workspace/ui/lib/i18n"

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

const composerWith = (wiring: ThreadMenuWiring): ReactNode =>
	createElement(ThreadComposer, {
		attachments: NO_ATTACHMENTS,
		canAttach: true,
		composerRef: { current: null },
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

	it("offers the present bots and marks the lead", () => {
		render(composerWith(conversationThreadMenu({ bots: BOTS, leadId: "orb" })))

		type("@")

		expect(screen.getByRole("option", { name: "Nyx" })).toBeTruthy()
		expect(screen.getByRole("option", { name: "Orb Lead" })).toBeTruthy()
	})

	it("writes the picked bot name into the prompt", () => {
		render(composerWith(conversationThreadMenu({ bots: BOTS, leadId: "orb" })))

		type("hey @n")
		pick("Nyx")

		expect(field().value).toBe("hey @Nyx ")
	})

	it("leaves the prompt untouched when no present bot carries the picked id", () => {
		expect(promptWithPickedMention("hey @n", BOTS, "ghost")).toBe("hey @n")
	})
})
