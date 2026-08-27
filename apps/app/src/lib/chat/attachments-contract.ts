import type { StorageFailure } from "../conversations/store-contract"

export type SubmittedAttachment = {
	name: string
	bytes: Uint8Array
}

export type AttachmentStoreError =
	| { kind: "unavailable"; failure: StorageFailure }
	| { kind: "storage"; failure: StorageFailure }
	| { kind: "unknownConversation"; id: string }
	| { kind: "tooMany"; count: number; limit: number }
	| { kind: "tooLarge"; name: string; bytes: number; limit: number }
	| { kind: "tooLargeTogether"; bytes: number; limit: number }
	| { kind: "unwritable"; detail: string }

export type AttachmentsOwner =
	| { kind: "bot"; id: string }
	| { kind: "conversation"; id: string }
