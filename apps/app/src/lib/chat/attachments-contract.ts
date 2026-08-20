import type { StorageFailure } from "../conversations/store-contract"

/** One file as the host takes it: the name the reader's file carried, and its
 * bytes. The name is a label and never a place — the host mints the one the file
 * is stored under. */
export type SubmittedAttachment = {
	name: string
	bytes: Uint8Array
}

/** Why nothing was stored. Every kind means the same thing about the disk — none of
 * the submitted files landed — and they are told apart so the notice can name the
 * limit that refused the call. Mirrors the host's own vocabulary. */
export type AttachmentStoreError =
	| { kind: "unavailable"; failure: StorageFailure }
	| { kind: "storage"; failure: StorageFailure }
	| { kind: "unknownConversation"; id: string }
	| { kind: "tooMany"; count: number; limit: number }
	| { kind: "tooLarge"; name: string; bytes: number; limit: number }
	| { kind: "tooLargeTogether"; bytes: number; limit: number }
	| { kind: "unwritable"; detail: string }
