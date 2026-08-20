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
	SubmittedAttachment,
} from "./attachments-contract"

/** What the composer is holding, per bot: a reader who switches bots comes back to
 * the files they had staged, and to why the ones before them were refused. */
export type AttachmentsState = {
	staged: Record<string, StagedAttachment[]>
	refusals: Record<string, AttachmentStoreError | null>
}

/** The two crossings a submission makes, both named by bot: a prompt that had to
 * store files first outlives the selection it started on, so nothing here is aimed
 * at whichever conversation happens to be on the screen when the disk answers. */
export type AttachmentsPort = {
	store: (
		botId: string,
		attachments: SubmittedAttachment[],
	) => Promise<string[]>
	send: (botId: string, text: string) => Promise<void>
}

export type AttachmentsController = {
	getState: () => AttachmentsState
	subscribe: (listener: () => void) => () => void
	stage: (botId: string, files: File[]) => void
	remove: (botId: string, id: string) => void
	dismissRefusal: (botId: string) => void
	/** Stores what this bot has staged, then hands it the prompt naming the stored
	 * paths. Answers whether the prompt was taken — a refused store and a second
	 * submission over the first both answer no, and both leave the draft. */
	submit: (botId: string, text: string) => Promise<boolean>
	/** A bot that is going away, with everything it was holding. */
	forget: (botId: string) => void
	/** Every bot's, for a composer that is going away. */
	release: () => void
}

export function createAttachmentsController(
	port: AttachmentsPort,
): AttachmentsController {
	let state: AttachmentsState = { staged: {}, refusals: {} }
	const listeners = new Set<() => void>()

	/** The bots with a store call in flight. A second submission over one of them is
	 * refused rather than queued: it would store the same files twice and send the
	 * prompt naming them twice. */
	const sending = new Set<string>()

	const publish = (next: AttachmentsState) => {
		state = next
		for (const listener of listeners) {
			listener()
		}
	}

	const stagedFor = (botId: string) => state.staged[botId] ?? NO_ATTACHMENTS

	const hold = (botId: string, items: StagedAttachment[]) =>
		publish({ ...state, staged: { ...state.staged, [botId]: items } })

	const holdRefusal = (botId: string, refusal: AttachmentStoreError | null) => {
		if ((state.refusals[botId] ?? null) === refusal) {
			return
		}
		publish({ ...state, refusals: { ...state.refusals, [botId]: refusal } })
	}

	/** The files that were sent, and only those: what the reader staged while the
	 * disk was answering is still theirs to send next. */
	const dropSent = (botId: string, sent: StagedAttachment[]) => {
		const ids = new Set(sent.map((item) => item.id))
		hold(
			botId,
			stagedFor(botId).filter((item) => !ids.has(item.id)),
		)
	}

	const submit = async (botId: string, text: string) => {
		if (sending.has(botId)) {
			return false
		}
		const items = stagedFor(botId)
		if (items.length === 0) {
			holdRefusal(botId, null)
			void port.send(botId, text)
			return true
		}

		sending.add(botId)
		let paths: string[]
		try {
			paths = await port.store(botId, await submittedFrom(items))
		} catch (reason) {
			holdRefusal(botId, toAttachmentStoreError(reason))
			return false
		} finally {
			sending.delete(botId)
		}

		releasePreviews(items)
		dropSent(botId, items)
		holdRefusal(botId, null)
		void port.send(botId, promptWithAttachments(text, paths))
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

		stage: (botId, files) => {
			if (files.length === 0) {
				return
			}
			hold(botId, [...stagedFor(botId), ...stagedFrom(files)])
		},

		remove: (botId, id) => hold(botId, withoutStaged(stagedFor(botId), id)),

		dismissRefusal: (botId) => holdRefusal(botId, null),

		submit,

		forget: (botId) => {
			releasePreviews(stagedFor(botId))
			publish({
				staged: { ...state.staged, [botId]: NO_ATTACHMENTS },
				refusals: { ...state.refusals, [botId]: null },
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
