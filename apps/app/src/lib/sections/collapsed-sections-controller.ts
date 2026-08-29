import { createQueue } from "../queue"
import { createWriteLoop } from "../write-loop"
import type { SpacePreferences } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type CollapsedSectionsState = {
	collapsedBySpaceId: Record<string, string[]>
}

export type CollapsedSectionsController = {
	getState: () => CollapsedSectionsState
	subscribe: (listener: () => void) => () => void
	enter: (spaceId: string) => Promise<void>
	keep: (spaceIds: string[]) => void
	collapse: (spaceId: string, sectionId: string, isCollapsed: boolean) => void
}

export const initialCollapsedSectionsState: CollapsedSectionsState = {
	collapsedBySpaceId: {},
}

export const collapsedIn = (state: CollapsedSectionsState, spaceId: string) =>
	state.collapsedBySpaceId[spaceId] ?? []

const withSection = (
	collapsed: string[],
	sectionId: string,
	isCollapsed: boolean,
) => {
	const without = collapsed.filter((id) => id !== sectionId)
	return isCollapsed ? [...without, sectionId] : without
}

export const createCollapsedSectionsController = (
	store: TranscriptStore,
): CollapsedSectionsController => {
	let state = initialCollapsedSectionsState
	const listeners = new Set<() => void>()

	const enqueue = createQueue()

	const set = (collapsedBySpaceId: Record<string, string[]>) => {
		state = { collapsedBySpaceId }
		for (const listener of listeners) {
			listener()
		}
	}

	const hold = (spaceId: string, collapsed: string[]) =>
		set({ ...state.collapsedBySpaceId, [spaceId]: collapsed })

	const read = async (spaceId: string) => {
		const { collapsedSectionIds } = await store.spacePreferences(spaceId)
		hold(spaceId, collapsedSectionIds)
	}

	const reloadAll = () => {
		for (const spaceId of Object.keys(state.collapsedBySpaceId)) {
			void enqueue(() => read(spaceId)).catch(() => undefined)
		}
	}

	const writes = createWriteLoop<string[], SpacePreferences>({
		enqueue,
		write: (spaceId, collapsedSectionIds) =>
			store.setSpacePreferences(spaceId, { collapsedSectionIds }),
		apply: (spaceId, written) => hold(spaceId, written.collapsedSectionIds),
		onRefused: reloadAll,
	})

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		enter: (spaceId: string) =>
			enqueue(() => read(spaceId)).catch(() => undefined),

		keep: (spaceIds: string[]) => {
			const kept = Object.entries(state.collapsedBySpaceId).filter(
				([spaceId]) => spaceIds.includes(spaceId),
			)
			if (kept.length !== Object.keys(state.collapsedBySpaceId).length) {
				set(Object.fromEntries(kept))
			}
		},

		collapse: (spaceId: string, sectionId: string, isCollapsed: boolean) => {
			const wanted = withSection(
				collapsedIn(state, spaceId),
				sectionId,
				isCollapsed,
			)
			hold(spaceId, wanted)
			writes.push(spaceId, wanted)
		},
	}
}
