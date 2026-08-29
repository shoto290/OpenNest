import { createQueue } from "../queue"
import { createWriteLoop } from "../write-loop"
import type { RosterPin, Section } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type BotSections = {
	move: (botId: string, sectionId: string | null) => void
	clear: (sectionId: string) => void
	pin: (pins: RosterPin[]) => void
}

export type SectionsState = {
	sections: Record<string, Section[]>
}

export type SectionsController = {
	getState: () => SectionsState
	subscribe: (listener: () => void) => () => void
	enter: (spaceId: string) => Promise<void>
	keep: (spaceIds: string[]) => void
	create: (
		spaceId: string,
		name: string,
		botId?: string | null,
	) => Promise<Section | undefined>
	rename: (id: string, name: string) => void
	pin: (spaceId: string, pins: RosterPin[]) => Promise<void>
	remove: (id: string) => Promise<void>
	moveBot: (botId: string, sectionId: string | null) => Promise<void>
}

export const initialSectionsState: SectionsState = { sections: {} }

export const sectionsIn = (state: SectionsState, spaceId: string) =>
	state.sections[spaceId] ?? []

export const spaceOfSection = (state: SectionsState, id: string) =>
	Object.keys(state.sections).find((spaceId) =>
		sectionsIn(state, spaceId).some((section) => section.id === id),
	)

const repositioned = (sections: Section[], pins: RosterPin[]) =>
	sections
		.map((section) => {
			const at = pins.findIndex((pin) => pin.id === section.id)
			return at < 0 ? section : { ...section, position: at }
		})
		.toSorted((one, other) => one.position - other.position)

export const createSectionsController = (
	store: TranscriptStore,
	bots: BotSections,
): SectionsController => {
	let state = initialSectionsState
	const listeners = new Set<() => void>()

	const enqueue = createQueue()

	const set = (fields: Partial<SectionsState>) => {
		state = { ...state, ...fields }
		for (const listener of listeners) {
			listener()
		}
	}

	const hold = (spaceId: string, sections: Section[]) =>
		set({ sections: { ...state.sections, [spaceId]: sections } })

	const held = (id: string) =>
		Object.values(state.sections)
			.flat()
			.find((section) => section.id === id)

	const spaceOf = (id: string) => spaceOfSection(state, id)

	const apply = (written: Section) => {
		const spaceId = spaceOf(written.id)
		if (!spaceId) {
			return
		}
		hold(
			spaceId,
			sectionsIn(state, spaceId).map((section) =>
				section.id === written.id ? written : section,
			),
		)
	}

	const read = async (spaceId: string) =>
		hold(spaceId, await store.sections(spaceId))

	const reload = (spaceId: string) => {
		void enqueue(() => read(spaceId)).catch(() => undefined)
	}

	const reloadAll = () => {
		for (const spaceId of Object.keys(state.sections)) {
			reload(spaceId)
		}
	}

	const writes = createWriteLoop<string, Section>({
		enqueue,
		write: (id, name) => store.renameSection(id, name),
		apply: (_id, written) => apply(written),
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
			const kept = Object.entries(state.sections).filter(([spaceId]) =>
				spaceIds.includes(spaceId),
			)
			if (kept.length !== Object.keys(state.sections).length) {
				set({ sections: Object.fromEntries(kept) })
			}
		},

		create: (spaceId: string, name: string, botId: string | null = null) =>
			enqueue(async () => {
				const created = await store.createSection(spaceId, name)
				hold(spaceId, [...sectionsIn(state, spaceId), created])
				if (botId) {
					await store.moveBotToSection(botId, created.id)
					bots.move(botId, created.id)
				}
				return created
			}).catch(() => {
				reload(spaceId)
				return undefined
			}),

		rename: (id: string, name: string) => {
			const stored = held(id)
			if (!stored) {
				return
			}
			apply({ ...stored, name })
			writes.push(id, name)
		},

		pin: (spaceId: string, pins: RosterPin[]) => {
			hold(spaceId, repositioned(sectionsIn(state, spaceId), pins))
			bots.pin(pins)
			return enqueue(() => store.pinRoster(spaceId, pins)).catch(() =>
				reload(spaceId),
			)
		},

		remove: (id: string) =>
			enqueue(async () => {
				const spaceId = spaceOf(id)
				if (!spaceId) {
					return
				}
				await store.deleteSection(id)
				writes.drop(id)
				hold(
					spaceId,
					sectionsIn(state, spaceId).filter((section) => section.id !== id),
				)
				bots.clear(id)
			}).catch(reloadAll),

		moveBot: (botId: string, sectionId: string | null) =>
			enqueue(async () => {
				await store.moveBotToSection(botId, sectionId)
				bots.move(botId, sectionId)
			}).catch(() => undefined),
	}
}
