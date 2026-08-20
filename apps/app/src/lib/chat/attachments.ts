import type { PromptAttachment } from "@workspace/ui/components/prompt-attachments"
import type { ChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type {
	AttachmentStoreError,
	SubmittedAttachment,
} from "./attachments-contract"

/** A file staged for the next prompt: what the chips draw, plus the file itself,
 * which is what the host is handed once the prompt is sent. */
export type StagedAttachment = PromptAttachment & {
	file: File
}

/** The list a bot with nothing staged reads as. Held once so a change that leaves
 * a bot alone hands its composer the very same array. */
export const NO_ATTACHMENTS: StagedAttachment[] = []

const MEGABYTE = 1024 * 1024

function inMegabytes(t: ChatCopy, bytes: number): string {
	return t("screen.attachment.megabytes", {
		size: Math.round(bytes / MEGABYTE),
	})
}

/** Only what an `img` can load gets a preview. Everything else is staged all the
 * same: what an attachment is on the way to Claude is a path, so no type is
 * refused here. */
function previewFor(file: File): string | undefined {
	return file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined
}

export function stagedFrom(files: File[]): StagedAttachment[] {
	return files.map((file) => ({
		id: crypto.randomUUID(),
		name: file.name,
		size: file.size,
		previewUrl: previewFor(file),
		file,
	}))
}

/** The previews given back to the browser. A staged file that is removed or sent
 * holds nothing afterwards. */
export function releasePreviews(items: StagedAttachment[]): void {
	for (const item of items) {
		if (item.previewUrl) {
			URL.revokeObjectURL(item.previewUrl)
		}
	}
}

export function withoutStaged(
	items: StagedAttachment[],
	id: string,
): StagedAttachment[] {
	releasePreviews(items.filter((item) => item.id === id))
	return items.filter((item) => item.id !== id)
}

export function submittedFrom(
	items: StagedAttachment[],
): Promise<SubmittedAttachment[]> {
	return Promise.all(
		items.map(async (item) => ({
			name: item.name,
			bytes: new Uint8Array(await item.file.arrayBuffer()),
		})),
	)
}

/** The prompt as Claude Code reads it: what the reader typed, then one stored
 * absolute path per line. Paths rather than image blocks — that is what lets a
 * file of any type be attached at all. */
export function promptWithAttachments(text: string, paths: string[]): string {
	return [text.trim(), ...paths].filter((line) => line.length > 0).join("\n")
}

export function toAttachmentStoreError(reason: unknown): AttachmentStoreError {
	if (typeof reason === "object" && reason !== null && "kind" in reason) {
		return reason as AttachmentStoreError
	}
	return { kind: "unwritable", detail: String(reason) }
}

/** Why the files stayed in the composer. The two refusals a reader can act on name
 * the limit that answered, since nothing on this side holds a copy of it. */
export function describeAttachmentError(
	t: ChatCopy,
	error: AttachmentStoreError,
): string {
	switch (error.kind) {
		case "unavailable":
		case "storage":
			return t("screen.attachment.storage", { failure: error.failure.kind })
		case "unknownConversation":
			return t("screen.attachment.unknownConversation")
		case "tooMany":
			return t("screen.attachment.tooMany", {
				limit: error.limit,
				staged: error.count,
			})
		case "tooLarge":
			return t("screen.attachment.tooLarge", {
				name: error.name,
				limit: inMegabytes(t, error.limit),
			})
		case "tooLargeTogether":
			return t("screen.attachment.tooLargeTogether", {
				bytes: inMegabytes(t, error.bytes),
				limit: inMegabytes(t, error.limit),
			})
		case "unwritable":
			return t("screen.attachment.unwritable", { detail: error.detail })
	}
}
