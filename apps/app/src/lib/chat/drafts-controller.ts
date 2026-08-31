export type DraftsController = {
	read: (threadId: string) => string
	remember: (threadId: string, draft: string) => void
	forget: (threadId: string) => void
}

export const createDraftsController = (): DraftsController => {
	const drafts = new Map<string, string>()

	return {
		read: (threadId) => drafts.get(threadId) ?? "",

		remember: (threadId, draft) => {
			drafts.set(threadId, draft)
		},

		forget: (threadId) => {
			drafts.delete(threadId)
		},
	}
}
