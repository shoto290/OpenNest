// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CodeSnippet } from "@workspace/ui/components/code-snippet"
import { MessageAttachments } from "@workspace/ui/components/message-attachments"
import {
	MessageBubble,
	MessageBubbleCollapsible,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"

import "@workspace/ui/lib/i18n"

const USER_PROMPT = "Summarise yesterday's call and pull out the follow-ups."

const FIRST_PARAGRAPH = "Freeze writes on the legacy workspace first."
const SECOND_PARAGRAPH = "Then run the export against the frozen copy."

const SNIPPET = "bun run build"

const ATTACHMENT = { id: "brief", name: "brief.pdf" }

const selectedText = () => window.getSelection()?.toString() ?? ""

const doubleClickOn = (element: Element) => fireEvent.doubleClick(element)

const contentOf = (container: HTMLElement) =>
	container.querySelector('[data-slot="message-bubble-content"]') as HTMLElement

afterEach(() => {
	cleanup()
	window.getSelection()?.removeAllRanges()
})

describe("double-click inside a message bubble", () => {
	it("selects the whole text of a user bubble", () => {
		render(
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>{USER_PROMPT}</MessageBubbleContent>
			</MessageBubble>,
		)

		doubleClickOn(screen.getByText(USER_PROMPT))

		expect(selectedText()).toBe(USER_PROMPT)
	})

	it("selects both paragraphs of a bot bubble", () => {
		render(
			<MessageBubble variant="soft">
				<MessageBubbleContent>
					<p>{FIRST_PARAGRAPH}</p>
					<p>{SECOND_PARAGRAPH}</p>
				</MessageBubbleContent>
			</MessageBubble>,
		)

		doubleClickOn(screen.getByText(FIRST_PARAGRAPH))

		expect(selectedText()).toContain(FIRST_PARAGRAPH)
		expect(selectedText()).toContain(SECOND_PARAGRAPH)
	})

	it("replaces the selection left by another bubble", () => {
		render(
			<>
				<MessageBubble variant="solid" align="end">
					<MessageBubbleContent>{USER_PROMPT}</MessageBubbleContent>
				</MessageBubble>
				<MessageBubble variant="soft">
					<MessageBubbleContent>{FIRST_PARAGRAPH}</MessageBubbleContent>
				</MessageBubble>
			</>,
		)

		doubleClickOn(screen.getByText(USER_PROMPT))
		doubleClickOn(screen.getByText(FIRST_PARAGRAPH))

		expect(window.getSelection()?.rangeCount).toBe(1)
		expect(selectedText()).toBe(FIRST_PARAGRAPH)
	})

	it("keeps an attachment chip out of the selection", () => {
		render(
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>
					<MessageAttachments items={[ATTACHMENT]} onOpen={() => {}} />
					<p>{USER_PROMPT}</p>
				</MessageBubbleContent>
			</MessageBubble>,
		)

		doubleClickOn(screen.getByText(USER_PROMPT))

		expect(selectedText()).toBe(USER_PROMPT)
		expect(selectedText()).not.toContain(ATTACHMENT.name)
	})

	it("selects the clamped part of a collapsed body and not its trigger", () => {
		render(
			<MessageBubble variant="soft">
				<MessageBubbleContent>
					<MessageBubbleCollapsible collapsedLines={2}>
						<p>{FIRST_PARAGRAPH}</p>
						<p>{SECOND_PARAGRAPH}</p>
					</MessageBubbleCollapsible>
				</MessageBubbleContent>
			</MessageBubble>,
		)

		doubleClickOn(screen.getByText(FIRST_PARAGRAPH))

		expect(selectedText()).toContain(SECOND_PARAGRAPH)
		expect(selectedText()).not.toContain("Show more")
	})

	it("selects the whole text from the padding of the bubble", () => {
		const { container } = render(
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>{USER_PROMPT}</MessageBubbleContent>
			</MessageBubble>,
		)

		doubleClickOn(contentOf(container))

		expect(selectedText()).toBe(USER_PROMPT)
	})

	it("leaves the selection untouched from the padding of an attachment-only bubble", () => {
		const { container } = render(
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>
					<MessageAttachments items={[ATTACHMENT]} onOpen={() => {}} />
				</MessageBubbleContent>
			</MessageBubble>,
		)

		doubleClickOn(contentOf(container))

		expect(window.getSelection()?.rangeCount ?? 0).toBe(0)
	})

	it("leaves the native selection untouched inside a code block", () => {
		render(
			<MessageBubble variant="soft">
				<MessageBubbleContent>
					<CodeSnippet code={SNIPPET} language="bash" />
				</MessageBubbleContent>
			</MessageBubble>,
		)

		doubleClickOn(screen.getByText(SNIPPET))

		expect(window.getSelection()?.rangeCount ?? 0).toBe(0)
	})

	it("leaves the native selection untouched when the target holds no text", () => {
		const { container } = render(
			<MessageBubble variant="soft">
				<MessageBubbleContent>{null}</MessageBubbleContent>
			</MessageBubble>,
		)

		doubleClickOn(contentOf(container))

		expect(window.getSelection()?.rangeCount ?? 0).toBe(0)
	})
})
