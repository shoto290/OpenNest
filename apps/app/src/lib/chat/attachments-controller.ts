import {
	NO_ATTACHMENTS,
	promptWithAttachments,
	releasePreviews,
	type StagedAttachment,
	stagedFrom,
	submittedFrom,
	toAttachmentStoreError,
	withoutStaged,
} from "./attachments"
import type {
	AttachmentStoreError,
	AttachmentsOwner,
	SubmittedAttachment,
} from "./attachments-contract"

export type AttachmentsState = {
	staged: Record<string, StagedAttachment[]>
	refusals: Record<string, AttachmentStoreError | null>
}

export type AttachmentsPort = {
	store: (
		owner: AttachmentsOwner,
		attachments: SubmittedAttachment[],
	) => Promise<string[]>
	send: (
		owner: AttachmentsOwner,
		text: string,
		repliedToMessageId?: string,
	) => boolean
}

export type AttachmentsController = {
	getState: () => AttachmentsState
	subscribe: (listener: () => void) => () => void
	stage: (owner: AttachmentsOwner, files: File[]) => void
	remove: (owner: AttachmentsOwner, id: string) => void
	dismissRefusal: (owner: AttachmentsOwner) => void
	submit: (
		owner: AttachmentsOwner,
		text: string,
		repliedToMessageId?: string,
	) => Promise<boolean>
	forget: (owner: AttachmentsOwner) => void
	release: () => void
}

export const ownerKey = (owner: AttachmentsOwner) => `${owner.kind}:${owner.id}`

export function createAttachmentsController(
	port: AttachmentsPort,
): AttachmentsController {
	let state: AttachmentsState = { staged: {}, refusals: {} }
	const listeners = new Set<() => void>()

	const sending = new Set<string>()

	const publish = (next: AttachmentsState) => {
		state = next
		for (const listener of listeners) {
			listener()
		}
	}

	const stagedFor = (owner: AttachmentsOwner) =>
		state.staged[ownerKey(owner)] ?? NO_ATTACHMENTS

	const hold = (owner: AttachmentsOwner, items: StagedAttachment[]) =>
		publish({ ...state, staged: { ...state.staged, [ownerKey(owner)]: items } })

	const holdRefusal = (
		owner: AttachmentsOwner,
		refusal: AttachmentStoreError | null,
	) => {
		const key = ownerKey(owner)
		if ((state.refusals[key] ?? null) === refusal) {
			return
		}
		publish({ ...state, refusals: { ...state.refusals, [key]: refusal } })
	}

	const dropSent = (owner: AttachmentsOwner, sent: StagedAttachment[]) => {
		const ids = new Set(sent.map((item) => item.id))
		hold(
			owner,
			stagedFor(owner).filter((item) => !ids.has(item.id)),
		)
	}

	const submit = async (
		owner: AttachmentsOwner,
		text: string,
		repliedToMessageId?: string,
	) => {
		const key = ownerKey(owner)
		if (sending.has(key)) {
			return false
		}
		const items = stagedFor(owner)
		if (items.length === 0) {
			holdRefusal(owner, null)
			return port.send(owner, text, repliedToMessageId)
		}

		sending.add(key)
		let paths: string[]
		try {
			paths = await port.store(owner, await submittedFrom(items))
		} catch (reason) {
			holdRefusal(owner, toAttachmentStoreError(reason))
			return false
		} finally {
			sending.delete(key)
		}

		if (
			!port.send(owner, promptWithAttachments(text, paths), repliedToMessageId)
		) {
			return false
		}

		releasePreviews(items)
		dropSent(owner, items)
		holdRefusal(owner, null)
		return true
	}

	return {
		getState: () => state,
		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		stage: (owner, files) => {
			if (files.length === 0) {
				return
			}
			hold(owner, [...stagedFor(owner), ...stagedFrom(files)])
		},

		remove: (owner, id) => hold(owner, withoutStaged(stagedFor(owner), id)),

		dismissRefusal: (owner) => holdRefusal(owner, null),

		submit,

		forget: (owner) => {
			const key = ownerKey(owner)
			releasePreviews(stagedFor(owner))
			publish({
				staged: { ...state.staged, [key]: NO_ATTACHMENTS },
				refusals: { ...state.refusals, [key]: null },
			})
		},

		release: () => {
			for (const items of Object.values(state.staged)) {
				releasePreviews(items)
			}
			publish({ staged: {}, refusals: {} })
		},
	}
}
