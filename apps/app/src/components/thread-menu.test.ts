// @vitest-environment happy-dom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import { createElement, createRef, type ReactNode, type RefObject } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import type { MentionBot } from "@workspace/ui/components/prompt-mention-menu"
import type { RosterBot } from "@workspace/ui/components/roster"

import { type PromptHandle, ThreadComposer } from "@/components/thread-composer"
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

const composerWith = (
	wiring: ThreadMenuWiring,
	promptRef: RefObject<PromptHandle | null> = createRef<PromptHandle>(),
): ReactNode =>
	createElement(ThreadComposer, {
		promptRef,
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

const mentionMenuWith = (
	bots: MentionBot[],
	onSeat?: (botId: string) => Promise<boolean>,
) => {
	const promptRef = createRef<PromptHandle>()
	return composerWith(
		conversationThreadMenu({ bots, leadId: "orb", onSeat, promptRef }),
		promptRef,
	)
}

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
		render(mentionMenuWith(BOTS))

		type("@")

		expect(screen.getByRole("option", { name: "Nyx" })).toBeTruthy()
		expect(screen.getByRole("option", { name: "Orb Lead" })).toBeTruthy()
	})

	it("writes the picked companion name into the prompt", () => {
		render(mentionMenuWith(BOTS))

		type("hey @n")
		pick("Nyx")

		expect(field().value).toBe("hey @Nyx ")
	})

	it("leaves the prompt untouched when no present companion carries the picked id", () => {
		expect(promptWithPickedMention("hey @n", BOTS, "ghost")).toBe("hey @n")
	})

	it("seats nobody when a companion already seated is picked", () => {
		const onSeat = vi.fn(() => Promise.resolve(true))
		render(mentionMenuWith(WITH_OUTSIDE, onSeat))

		type("hey @n")
		pick("Nyx")

		expect(onSeat).not.toHaveBeenCalled()
		expect(field().value).toBe("hey @Nyx ")
	})

	it("seats a companion marked outside before writing its mention", async () => {
		const onSeat = vi.fn(() => Promise.resolve(true))
		render(mentionMenuWith(WITH_OUTSIDE, onSeat))

		type("hey @ve")
		pick(/Vela/)

		expect(onSeat).toHaveBeenCalledWith("vela")
		await waitFor(() => expect(field().value).toBe("hey @Vela "))
	})

	it("writes the mention against the prompt as the seating lands", async () => {
		let landSeating: (isSeated: boolean) => void = () => undefined
		const onSeat = vi.fn(
			() =>
				new Promise<boolean>((resolve) => {
					landSeating = resolve
				}),
		)
		render(mentionMenuWith(WITH_OUTSIDE, onSeat))

		type("hey @ve")
		pick(/Vela/)
		type("hey there @ve")
		landSeating(true)

		await waitFor(() => expect(field().value).toBe("hey there @Vela "))
	})

	it("leaves the prompt alone when seating the companion fails", async () => {
		const onSeat = vi.fn(() => Promise.resolve(false))
		render(mentionMenuWith(WITH_OUTSIDE, onSeat))

		type("hey @ve")
		pick(/Vela/)

		await waitFor(() => expect(onSeat).toHaveBeenCalledWith("vela"))
		expect(field().value).toBe("hey @ve")
	})
})
