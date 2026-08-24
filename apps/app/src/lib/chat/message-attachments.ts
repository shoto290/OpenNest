import type { MessageAttachment } from "@workspace/ui/components/message-attachments"

import { assetSrc } from "../host"

const STORE_DIR = "attachments"

const MINTED_NAME =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,16})?$/

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

const NO_MESSAGE_ATTACHMENTS: MessageAttachment[] = []

export type StoredAttachmentPlace = {
	root: string
	conversationId: string
	submittedName: string
}

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
