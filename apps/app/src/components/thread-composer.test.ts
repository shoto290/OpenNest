// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import "@workspace/ui/lib/i18n"

import {
	ThreadComposer,
	type ThreadComposerProps,
} from "@/components/thread-composer"
import type { StagedAttachment } from "@/lib/chat/attachments"

const NO_ATTACHMENTS: StagedAttachment[] = []

type ComposerFixture = {
	onSubmitPrompt: (text: string) => Promise<boolean>
	canAttach?: boolean
	queryIn?: (prompt: string) => string | null
	menu?: ThreadComposerProps["menu"]
}

const composerOf = ({
	onSubmitPrompt,
	canAttach = true,
	queryIn = () => null,
	menu = (slot) => slot.children,
}: ComposerFixture) =>
	createElement(ThreadComposer, {
		attachments: NO_ATTACHMENTS,
		canAttach,
		composerRef: { current: null },
		isDropTarget: false,
		menu,
		onAttach: () => undefined,
		onPromptChange: () => undefined,
		onRemoveAttachment: () => undefined,
		onSubmitPrompt,
		placeholder: "Ask Nyx to do something…",
		queryIn,
		readDraft: () => "",
	})

const field = () => screen.getByRole("textbox") as HTMLTextAreaElement

const type = (text: string) => {
	fireEvent.change(field(), { target: { value: text } })
}

const send = async () => {
	fireEvent.click(screen.getByRole("button", { name: "Send prompt" }))
	await act(async () => {
		await Promise.resolve()
	})
}

describe("ThreadComposer", () => {
	afterEach(cleanup)

	it("clears the field once the prompt is sent", async () => {
		render(composerOf({ onSubmitPrompt: () => Promise.resolve(true) }))

		type("ship it")
		await send()

		expect(field().value).toBe("")
	})

	it("keeps what the reader typed while the send was in flight", async () => {
		let release: (sent: boolean) => void = () => undefined
		render(
			composerOf({
				onSubmitPrompt: () =>
					new Promise<boolean>((resolve) => {
						release = resolve
					}),
			}),
		)

		type("ship it")
		fireEvent.click(screen.getByRole("button", { name: "Send prompt" }))
		type("and then this")
		await act(async () => {
			release(true)
		})

		expect(field().value).toBe("and then this")
	})

	it("keeps the prompt when the send is refused", async () => {
		render(composerOf({ onSubmitPrompt: () => Promise.resolve(false) }))

		type("ship it")
		await send()

		expect(field().value).toBe("ship it")
	})

	it("keeps the menu closed once dismissed until the query stops matching", () => {
		const opened: boolean[] = []
		render(
			composerOf({
				menu: (slot) => {
					opened.push(slot.isOpen)
					return createElement(
						"div",
						null,
						createElement(
							"button",
							{ onClick: slot.onDismiss, type: "button" },
							"Dismiss menu",
						),
						slot.children,
					)
				},
				onSubmitPrompt: () => Promise.resolve(true),
				queryIn: (prompt) => (prompt.startsWith("/") ? prompt.slice(1) : null),
			}),
		)

		type("/re")
		expect(opened.at(-1)).toBe(true)

		fireEvent.click(screen.getByRole("button", { name: "Dismiss menu" }))
		type("/rev")
		expect(opened.at(-1)).toBe(false)

		type("plain text")
		type("/re")
		expect(opened.at(-1)).toBe(true)
	})

	it("rewrites the prompt with the entry the reader picked", () => {
		render(
			composerOf({
				menu: (slot) =>
					createElement(
						"div",
						null,
						createElement(
							"button",
							{ onClick: () => slot.onPick("/review "), type: "button" },
							"Pick review",
						),
						slot.children,
					),
				onSubmitPrompt: () => Promise.resolve(true),
				queryIn: (prompt) => (prompt.startsWith("/") ? prompt.slice(1) : null),
			}),
		)

		type("/re")
		fireEvent.click(screen.getByRole("button", { name: "Pick review" }))

		expect(field().value).toBe("/review ")
	})

	it("disables the attach button while attaching is refused", () => {
		render(
			composerOf({
				canAttach: false,
				onSubmitPrompt: () => Promise.resolve(true),
			}),
		)

		expect(
			screen
				.getByRole("button", { name: "Attach files" })
				.hasAttribute("disabled"),
		).toBe(true)
	})
})
