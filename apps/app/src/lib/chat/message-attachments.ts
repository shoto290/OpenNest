import type { MessageAttachment } from "@workspace/ui/components/message-attachments"

import { assetSrc } from "../host"

/** The directory the host keeps attached files in, one directory per conversation
 * and one file in it — so a stored path always ends `attachments/<conversation>/<file>`. */
const STORE_DIR = "attachments"

/** The name the host mints for a stored file: an identifier of its own, plus the
 * extension of the submitted name when it had a plain one. Mirrors `minted_name` on
 * the host side, and is what tells a path this app wrote from a path a reader typed
 * a directory called `attachments` into. */
const MINTED_NAME =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,16})?$/

/** What an `img` can load. Anything else is handed over as a name, the way a file
 * with no preview is staged in the composer. */
const IMAGE_EXTENSIONS = new Set([
	"avif",
	"bmp",
	"gif",
	"ico",
	"jpeg",
	"jpg",
	"png",
	"svg",
	"webp",
])

/** A message with nothing attached, held once so every such row hands the same
 * array to the same component. */
const NO_MESSAGE_ATTACHMENTS: MessageAttachment[] = []

/** Where a stored file sits, in the parts the shape is made of. */
export type StoredAttachmentPlace = {
	/** The directory the store itself lives under. */
	root: string
	conversationId: string
	/** The name the file arrived under, which only its extension survives. */
	submittedName: string
}

/** One bubble's worth of a stored message: the words, and the files the lines under
 * them named. */
export type MessageContent = {
	text: string
	attachments: MessageAttachment[]
}

const segmentsOf = (path: string): string[] => path.split(/[\\/]/)

const nameOf = (path: string): string => segmentsOf(path).at(-1) ?? path

const extensionOf = (name: string): string => {
	const dot = name.lastIndexOf(".")
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
}

/** Whether a line points at a file inside the attachments directory. Three things
 * have to hold at once — the directory two levels up is the store's, something
 * stands in for the conversation between them, and the file wears a name this app
 * minted — so a path a reader wrote by hand stays in their text. */
const isStoredAttachmentPath = (line: string): boolean => {
	const segments = segmentsOf(line.trim())
	return (
		segments.length > 3 &&
		segments.at(-3) === STORE_DIR &&
		(segments.at(-2) ?? "").length > 0 &&
		MINTED_NAME.test(segments.at(-1) ?? "")
	)
}

const toAttachment = (path: string): MessageAttachment => {
	const name = nameOf(path)
	return {
		id: path,
		name,
		previewUrl: IMAGE_EXTENSIONS.has(extensionOf(name))
			? assetSrc(path)
			: undefined,
	}
}

/** A path shaped the way the host shapes a stored one. Stated here rather than at
 * the caller so the shape read back below is the only one this side knows: the fake
 * driver of `bun dev:web` has no disk to write to and still has to hand a bubble
 * something it reads back as a file. */
export const storedAttachmentPath = ({
	root,
	conversationId,
	submittedName,
}: StoredAttachmentPlace): string => {
	const extension = extensionOf(submittedName)
	const minted = extension
		? `${crypto.randomUUID()}.${extension}`
		: crypto.randomUUID()
	return [root, STORE_DIR, conversationId, minted].join("/")
}

/**
 * A stored message read back the way it is drawn: the text the reader typed, and
 * the files the prompt named under it. The inverse of `promptWithAttachments` —
 * the paths are what Claude reads a file by, and noise to whoever wrote them, so
 * they leave the text and come back as the files themselves.
 *
 * Only trailing lines are lifted, because that is where the format puts them. A
 * message that ends in none is handed back untouched, its own string and all.
 */
export const messageWithAttachments = (text: string): MessageContent => {
	const lines = text.split("\n")
	let firstPath = lines.length
	while (firstPath > 0 && isStoredAttachmentPath(lines[firstPath - 1] ?? "")) {
		firstPath -= 1
	}

	if (firstPath === lines.length) {
		return { text, attachments: NO_MESSAGE_ATTACHMENTS }
	}

	return {
		text: lines.slice(0, firstPath).join("\n").trimEnd(),
		attachments: lines
			.slice(firstPath)
			.map((line) => toAttachment(line.trim())),
	}
}
