import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"

import { newSpaceName } from "./space-settings"

import { createQueue } from "../queue"
import { createWriteLoop } from "../write-loop"
import type { Space } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type SpacesState = {
	spaces: Space[]
	selectedSpaceId: string | null
	isSettingsOpen: boolean
}

export type SpacesController = {
	getState: () => SpacesState
	subscribe: (listener: () => void) => () => void
	load: (lastSpaceId: string | null) => Promise<void>
	select: (id: string) => void
	create: () => Promise<void>
	setSettingsOpen: (isSettingsOpen: boolean) => void
	describe: (id: string, value: SpaceSettingsValue) => void
	remove: (id: string) => Promise<void>
}

export const initialSpacesState: SpacesState = {
	spaces: [],
	selectedSpaceId: null,
	isSettingsOpen: false,
}

export const createSpacesController = (
	store: TranscriptStore,
): SpacesController => {
	let state = initialSpacesState
	const listeners = new Set<() => void>()

	const enqueue = createQueue()

	const set = (fields: Partial<SpacesState>) => {
		state = { ...state, ...fields }
		for (const listener of listeners) {
			listener()
		}
	}

	const apply = (written: Space) =>
		set({
			spaces: state.spaces.map((space) =>
				space.id === written.id ? written : space,
			),
		})

	const read = async (lastSpaceId: string | null) => {
		const spaces = await store.spaces()
		const stillHeld = spaces.find(
			(space) => space.id === state.selectedSpaceId,
		)?.id
		const remembered = spaces.find((space) => space.id === lastSpaceId)?.id
		set({
			spaces,
			selectedSpaceId: stillHeld ?? remembered ?? spaces[0]?.id ?? null,
		})
	}

	const reload = () => {
		void enqueue(() => read(null)).catch(() => undefined)
	}

	const writes = createWriteLoop<SpaceSettingsValue, Space>({
		enqueue,
		write: (id, value) => store.updateSpace(id, value.name, value.colour),
		apply: (_id, written) => apply(written),
		onRefused: reload,
	})

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		load: (lastSpaceId: string | null) =>
			enqueue(() => read(lastSpaceId)).catch(() => undefined),

		select: (id: string) => {
			if (id !== state.selectedSpaceId) {
				set({ selectedSpaceId: id })
			}
		},

		create: () =>
			enqueue(async () => {
				const created = await store.createSpace(newSpaceName())
				set({
					spaces: [...state.spaces, created],
					selectedSpaceId: created.id,
				})
			}).catch(reload),

		setSettingsOpen: (isSettingsOpen: boolean) => set({ isSettingsOpen }),

		describe: (id: string, value: SpaceSettingsValue) => {
			const held = state.spaces.find((space) => space.id === id)
			if (!held) {
				return
			}
			apply({ ...held, name: value.name, colour: value.colour })
			writes.push(id, value)
		},

		remove: (id: string) =>
			enqueue(async () => {
				await store.deleteSpace(id)
				writes.drop(id)
				const spaces = state.spaces.filter((space) => space.id !== id)
				set({
					spaces,
					selectedSpaceId: spaces[0]?.id ?? null,
					isSettingsOpen: false,
				})
			}).catch(reload),
	}
}
