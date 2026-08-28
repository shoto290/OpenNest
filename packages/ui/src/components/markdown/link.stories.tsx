import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { MarkdownProse, slotsIn } from "@workspace/storybook/story-utils"
import { MarkdownLink } from "@workspace/ui/components/markdown/link"

const REPORT_URL = "https://docs.example.com/reports/nest-42"

const USERINFO_URL = "https://docs.example.com@attacker.test/reports"

const SCRIPT_URL = "javascript:alert('nest')"

const LONG_URL =
	"https://docs.example.com/reports/2026/08/nest_42/occupants?include=arrivals%2Cdepartures&sort=timestamp&cursor=eyJvZmZzZXQiOjEyMCwibGltaXQiOjQwfQ&signature=9f2c1ad4e7b8c05a"

const hostsIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "markdown-link-host")

const meta = preview.meta({
	title: "Conversation/Markdown/MarkdownLink",
	component: MarkdownLink,
	parameters: {
		docs: {
			description: {
				component:
					"The anchor `<Markdown>` gives the parser, and the one place a destination is decided. Link text is authored — by a reader or by an agent — and reading it says nothing about where it goes, so the text is never questioned and the host is always shown, taken from the href and from nothing fetched. Only `http(s)`, `mailto`, `tel` and a same-document fragment stay clickable; every other scheme, and every path that would resolve against this window, renders as plain text. A web link opens outside the app with no referrer and carries its host beside it, marked with the host initial — decoration only, out of the accessible name and out of anything copied from the transcript.",
			},
		},
	},
	args: { href: REPORT_URL, children: "the sync report" },
	argTypes: { href: { control: "text" } },
	decorators: [(Story) => <MarkdownProse>{Story()}</MarkdownProse>],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A web destination: the authored text, the host initial as a mark, then the host itself. Check that the mark holds its box in both themes — flip the theme layout toolbar to side-by-side — that it is tinted from the text rather than from a surface token, and that the anchor stays inline so the sentence around it still wraps as prose.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const link = canvas.getByRole("link")

		await expect(link).toHaveAttribute("target", "_blank")
		await expect(link).toHaveAttribute("rel", "noreferrer noopener")
		await expect(hostsIn(canvasElement)[0]).toHaveTextContent(
			"(docs.example.com)",
		)
	},
})

export const DeceptiveText = meta.story({
	args: { children: "docs.example.com", href: USERINFO_URL },
	parameters: {
		docs: {
			description: {
				story:
					"Userinfo hides the host: everything before the `@` is a username, so this link reads as the documentation site and resolves to another host entirely. The parser answers what reading cannot, and the host shown is the one the browser will open. Check that the text keeps its authored spelling while the host beside it reads `attacker.test`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(hostsIn(canvasElement)[0]).toHaveTextContent("(attacker.test)")
	},
})

export const UnsafeUrl = meta.story({
	args: { children: "looks like a link", href: SCRIPT_URL },
	parameters: {
		docs: {
			description: {
				story:
					"A scheme this app cannot open is not a link. A `javascript:` href never becomes an anchor — there is no element to click, focus or middle-click — and the authored text stays on screen as the prose it always was. The same branch catches `irc:`, `data:` and any path that would resolve against this window. Check that nothing here is focusable and that the text is not styled as a destination.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("link")).not.toBeInTheDocument()
		await expect(canvas.getByText(/looks like a link/)).toBeInTheDocument()
	},
})

export const Fragment = meta.story({
	args: { children: "the summary", href: "#summary" },
	parameters: {
		docs: {
			description: {
				story:
					"A same-document fragment stays in the answer, so it takes no host and no new window — naming a host for a link that never leaves the transcript would be noise. Check that the anchor keeps the prose underline and nothing else.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByRole("link")).not.toHaveAttribute("target")
		await expect(hostsIn(canvasElement)).toHaveLength(0)
	},
})

export const MailTo = meta.story({
	args: { children: "write to the nest", href: "mailto:nest@example.com" },
	parameters: {
		docs: {
			description: {
				story:
					"`mailto:` and `tel:` are handed to the platform rather than opened as pages, so they stay clickable and carry no host mark. Check that the anchor is a plain link — the mark belongs to destinations that open a site.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByRole("link")).toHaveAttribute(
			"href",
			"mailto:nest@example.com",
		)
		await expect(hostsIn(canvasElement)).toHaveLength(0)
	},
})

export const LongDestination = meta.story({
	args: { children: LONG_URL, href: LONG_URL },
	parameters: {
		docs: {
			description: {
				story:
					"A bare URL longer than the container that holds it. The text gives way, the destination never does: the authored text truncates at the available width while the mark and the host stay whole on one line. Check that the block does not widen and that the host is the last thing left to read.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const text = canvas.getByRole("link").firstElementChild as HTMLElement

		await expect(text.scrollWidth).toBeGreaterThan(text.clientWidth)
		await expect(hostsIn(canvasElement)[0]).toHaveTextContent(
			"(docs.example.com)",
		)
	},
})
