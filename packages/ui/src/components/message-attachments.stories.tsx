import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	type MessageAttachment,
	MessageAttachments,
} from "@workspace/ui/components/message-attachments"
import {
	MessageBubble,
	MessageBubbleContent,
	MessageBubbleGroup,
} from "@workspace/ui/components/message-bubble"

/** Drawn inline so the stories never reach the network: a preview is only ever a
 * URL an `img` can load, and a data URL is the same one on every run. */
const SCREENSHOT_PREVIEW =
	"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22480%22%20height%3D%22320%22%20viewBox%3D%220%200%2096%2064%22%3E%3Crect%20width%3D%2296%22%20height%3D%2264%22%20fill%3D%22%231e293b%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%2210%22%20width%3D%2252%22%20height%3D%228%22%20rx%3D%224%22%20fill%3D%22%23f97316%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%2226%22%20width%3D%2280%22%20height%3D%226%22%20rx%3D%223%22%20fill%3D%22%23475569%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%2240%22%20width%3D%2264%22%20height%3D%226%22%20rx%3D%223%22%20fill%3D%22%23475569%22%2F%3E%3C%2Fsvg%3E"

/** Twice as tall as it is wide — the shape that would stretch the bubble if the
 * thumbnail were not bounded. */
const TALL_PREVIEW =
	"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22320%22%20height%3D%22800%22%20viewBox%3D%220%200%2048%20120%22%3E%3Crect%20width%3D%2248%22%20height%3D%22120%22%20fill%3D%22%230f766e%22%2F%3E%3Ccircle%20cx%3D%2224%22%20cy%3D%2232%22%20r%3D%2214%22%20fill%3D%22%23a7f3d0%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%2260%22%20width%3D%2232%22%20height%3D%2248%22%20rx%3D%226%22%20fill%3D%22%23134e4a%22%2F%3E%3C%2Fsvg%3E"

const DIAGRAM_PREVIEW =
	"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22240%22%20height%3D%22240%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20fill%3D%22%23312e81%22%2F%3E%3Ccircle%20cx%3D%2240%22%20cy%3D%2224%22%20r%3D%2214%22%20fill%3D%22%23c7d2fe%22%2F%3E%3C%2Fsvg%3E"

/** A source the host handed over in good faith and no decoder accepts. */
const BROKEN_PREVIEW = "data:image/png;base64,bm90LWFuLWltYWdl"

const ONE_IMAGE: MessageAttachment[] = [
	{
		id: "screenshot",
		name: "composer-empty.png",
		previewUrl: SCREENSHOT_PREVIEW,
	},
]

const SEVERAL_IMAGES: MessageAttachment[] = [
	...ONE_IMAGE,
	{ id: "capture", name: "sidebar-tall.png", previewUrl: TALL_PREVIEW },
	{ id: "diagram", name: "transport-diagram.svg", previewUrl: DIAGRAM_PREVIEW },
]

const MIXED_ITEMS: MessageAttachment[] = [
	...ONE_IMAGE,
	{ id: "notes", name: "release-notes.md" },
	{ id: "manifest", name: "components.json" },
]

const LONG_ITEMS: MessageAttachment[] = [
	...SEVERAL_IMAGES,
	{
		id: "report",
		name: "release-notes-for-the-desktop-shell-and-the-chat-surface.md",
	},
	{ id: "session", name: "session-2026-03-04.log" },
	{ id: "manifest", name: "components.json" },
]

const THREAD_WIDTH = "w-[34rem] max-w-full"

const USER_PROMPT = "Here is what the composer looks like on my machine."

const AGENT_REPLY = "Thanks — I re-rendered it against the current tokens."

const meta = preview.meta({
	title: "AI/MessageAttachments",
	component: MessageAttachments,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The files a message carries, drawn inside its bubble above the text. A picture shows itself as a thumbnail, bounded so neither a tall nor a wide one stretches the bubble; anything else shows a file glyph, its name and its extension. Activating an item reports its id — resolving, reading or opening the file is never this row's business. Colors come from the bubble's own text color, so the row reads on the reader's `solid` bubble and the bot's `soft` one alike.",
			},
		},
	},
	args: { items: ONE_IMAGE, onOpen: fn() },
	render: (args) => (
		<MessageBubbleGroup spacing="default" className={THREAD_WIDTH}>
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>
					<MessageAttachments {...args} />
					<p>{USER_PROMPT}</p>
				</MessageBubbleContent>
			</MessageBubble>
		</MessageBubbleGroup>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"One screenshot on its own, the commonest thing a reader sends. Check that the thumbnail shows the picture rather than a path, that it stays well inside the bubble instead of spanning its width, and that activating it reports the item's id — the host opens by id, so an index would open the wrong file. `SeveralImages` covers more than one.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const list = canvas.getByRole("list", { name: "Attachments" })
		const thumbnail = canvas.getByRole("button", {
			name: "Open composer-empty.png",
		})
		const picture = list.querySelector("img")
		const bubbleWidth =
			list
				.closest("[data-slot='message-bubble-content']")
				?.getBoundingClientRect().width ?? 0

		await waitFor(() =>
			expect(picture?.getBoundingClientRect().width ?? 0).toBeGreaterThan(100),
		)
		await expect(thumbnail.getBoundingClientRect().width).toBeLessThan(
			bubbleWidth * 0.8,
		)

		await userEvent.click(thumbnail)
		await expect(args.onOpen).toHaveBeenCalledWith("screenshot")
	},
})

export const SeveralImages = meta.story({
	args: { items: SEVERAL_IMAGES },
	parameters: {
		docs: {
			description: {
				story:
					"Three pictures in one turn, one of them twice as tall as it is wide. Check that every thumbnail is capped at the same height so the row keeps a single baseline, that the tall one narrows instead of pushing the bubble down, and that they sit side by side rather than stacking. Reach for it when changing the thumbnail bounds. `LongContent` covers the point where the row wraps.",
			},
		},
	},
	play: async ({ canvas }) => {
		const list = canvas.getByRole("list", { name: "Attachments" })
		const thumbnails = Array.from(list.querySelectorAll("img"))

		await expect(thumbnails).toHaveLength(SEVERAL_IMAGES.length)
		await waitFor(() =>
			expect(thumbnails[0].getBoundingClientRect().height).toBeGreaterThan(0),
		)
		for (const thumbnail of thumbnails) {
			await expect(
				thumbnail.getBoundingClientRect().height,
			).toBeLessThanOrEqual(160)
		}
	},
})

export const MixedKinds = meta.story({
	args: { items: MIXED_ITEMS },
	parameters: {
		docs: {
			description: {
				story:
					"A screenshot next to two documents — the row rendering both of its shapes at once. Check that a document falls back to the glyph, its name and its extension while the picture keeps its thumbnail, and that the two shapes align on the same top edge instead of drifting. `Default` covers a lone picture, `Error` the document shape a failed picture falls back to.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("release-notes.md")).toBeVisible()
		await expect(canvas.getByText("JSON")).toBeVisible()
		await expect(
			canvas.getByRole("button", { name: "Open composer-empty.png" }),
		).toBeEnabled()
	},
})

export const States = meta.story({
	args: { items: MIXED_ITEMS },
	parameters: {
		docs: {
			description: {
				story:
					"The row under the keyboard: tabbing walks it in reading order and stops on the document after the thumbnail. Check that the focus ring is drawn from the bubble's own text color so it reads on the yellow as well as the grey, that its offset keeps it off the item's border, and that hovering an item dims it without moving it — a row that reflows under the pointer loses the reader's target.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: "Open composer-empty.png" }),
		).toHaveFocus()

		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: "Open release-notes.md" }),
		).toHaveFocus()
	},
})

export const LongContent = meta.story({
	args: { items: LONG_ITEMS },
	parameters: {
		docs: {
			description: {
				story:
					"More files than fit on one line, one named far past the width of an item. Check that the row wraps into a second line instead of scrolling or squeezing, that a long name truncates while its extension stays put, and that the items keep their reading order. Reach for it when changing item padding or the row gap — this is where the bubble runs out of width first.",
			},
		},
	},
	play: async ({ canvas }) => {
		const items = canvas.getAllByRole("listitem")
		const [first] = items

		await expect(items).toHaveLength(LONG_ITEMS.length)
		await waitFor(() =>
			expect(
				items[items.length - 1].getBoundingClientRect().top,
			).toBeGreaterThan(first.getBoundingClientRect().bottom),
		)
	},
})

export const Error = meta.story({
	args: {
		items: [
			{ id: "screenshot", name: "capture.png", previewUrl: BROKEN_PREVIEW },
			{ id: "notes", name: "release-notes.md" },
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A source the host resolved and no decoder accepts. Check that the broken image is replaced by the same shape a document takes — a glyph, the name and the extension — rather than a torn-image icon or an empty box, and that the item stays activatable so the reader can still open the file. `MixedKinds` covers the shape it falls back to when nothing was ever resolved.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const list = canvas.getByRole("list", { name: "Attachments" })

		await waitFor(() => expect(canvas.getByText("capture.png")).toBeVisible())
		await expect(list.querySelector("img")).toBeNull()

		await userEvent.click(
			canvas.getByRole("button", { name: "Open capture.png" }),
		)
		await expect(args.onOpen).toHaveBeenCalledWith("screenshot")
	},
})

export const InTranscript = meta.story({
	args: { items: MIXED_ITEMS },
	parameters: {
		docs: {
			description: {
				story:
					"The row on both surfaces it ever lands on: the reader's `solid` bubble and the bot's `soft` one. Check that the glyph, the name and the extension stay legible on the yellow as well as on the muted grey, and that the item border reads without turning into a hard edge. Flip the `theme_layout` toolbar to side-by-side before calling a change to these colors done.",
			},
		},
	},
	render: (args) => (
		<MessageBubbleGroup spacing="default" className={THREAD_WIDTH}>
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>
					<MessageAttachments {...args} />
					<p>{USER_PROMPT}</p>
				</MessageBubbleContent>
			</MessageBubble>
			<MessageBubble variant="soft" align="start">
				<MessageBubbleContent>
					<MessageAttachments {...args} />
					<p>{AGENT_REPLY}</p>
				</MessageBubbleContent>
			</MessageBubble>
		</MessageBubbleGroup>
	),
	play: async ({ canvas }) => {
		const rows = canvas.getAllByRole("list", { name: "Attachments" })

		await expect(rows).toHaveLength(2)
		await expect(rows[0].closest("[data-variant]")).toHaveAttribute(
			"data-variant",
			"solid",
		)
		await expect(rows[1].closest("[data-variant]")).toHaveAttribute(
			"data-variant",
			"soft",
		)
	},
})

export const Empty = meta.story({
	args: { items: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A message that carries nothing — every turn that is only text. Check that the row renders no element at all rather than an empty box: the bubble stacks its blocks with a gap, so a zero-height list would still cost the text one. `Default` covers the first file landing in it.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("list")).not.toBeInTheDocument()
	},
})
