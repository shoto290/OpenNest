import type { PromptAttachment } from "@workspace/ui/components/prompt-attachments"

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

function inMegabytes(bytes: number): string {
	return `${Math.round(bytes / MEGABYTE)} MB`
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
export function describeAttachmentError(error: AttachmentStoreError): string {
	switch (error.kind) {
		case "unavailable":
		case "storage":
			return `The files could not be written down (${error.failure.kind}).`
		case "unknownConversation":
			return "This conversation is not on the record any more. Reopen the bot and attach them again."
		case "tooMany":
			return `A prompt carries ${error.limit} files at most, and ${error.count} are staged.`
		case "tooLarge":
			return `${error.name} is over the ${inMegabytes(error.limit)} a single file may weigh.`
		case "tooLargeTogether":
			return `The staged files come to ${inMegabytes(error.bytes)}, over the ${inMegabytes(error.limit)} one prompt may carry.`
		case "unwritable":
			return `The files could not be written down: ${error.detail}`
	}
}
