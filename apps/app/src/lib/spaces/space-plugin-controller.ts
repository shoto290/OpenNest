import { createQueue } from "../queue"
import {
	createHistoryFilesReader,
	type HistoryFilesState,
	initialHistoryFilesState,
} from "../bots/history-files-controller"
import {
	createSkillFilesController,
	type OpenedSkillFile,
	type SkillFilesController,
} from "../bots/skill-files-controller"
import type {
	BotHistoryEntry,
	BotSkill,
	BotSkillDraft,
} from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type SpacePluginState = HistoryFilesState & {
	spaceId: string | null
	skills: BotSkill[]
	commits: BotHistoryEntry[]
	hasFailedToLoad: boolean
	file: OpenedSkillFile | null
}

export type SpacePluginController = SkillFilesController & {
	getState: () => SpacePluginState
	subscribe: (listener: () => void) => () => void
	open: (spaceId: string) => Promise<void>
	reload: () => void
	createSkill: (draft: BotSkillDraft, isPreloaded: boolean) => void
	saveSkill: (skillId: string, draft: BotSkillDraft) => void
	setSkillPreloaded: (skillId: string, isPreloaded: boolean) => void
	removeSkill: (skillId: string) => void
	openFiles: (oldestCommitId: string, newestCommitId: string) => void
	revert: (oldestCommitId: string, newestCommitId: string) => void
}

export const initialSpacePluginState: SpacePluginState = {
	...initialHistoryFilesState,
	spaceId: null,
	skills: [],
	commits: [],
	hasFailedToLoad: false,
	file: null,
}

export const createSpacePluginController = (
	store: TranscriptStore,
): SpacePluginController => {
	let state = initialSpacePluginState
	const listeners = new Set<() => void>()

	const enqueue = createQueue()

	const set = (fields: Partial<SpacePluginState>) => {
		state = { ...state, ...fields }
		for (const listener of listeners) {
			listener()
		}
	}

	const read = async (spaceId: string) => {
		const [skills, commits] = await Promise.all([
			store.spacePluginSkills(spaceId),
			store.spacePluginHistory(spaceId),
		])
		set({ spaceId, skills, commits, hasFailedToLoad: false })
	}

	const noteFailedRead = () => set({ hasFailedToLoad: true })

	const reload = () => {
		const spaceId = state.spaceId
		if (!spaceId) {
			return
		}
		void enqueue(() => read(spaceId)).catch(noteFailedRead)
	}

	const run = (task: (spaceId: string) => Promise<void>) => {
		const spaceId = state.spaceId
		if (!spaceId) {
			return
		}
		void enqueue(() => task(spaceId)).catch(reload)
	}

	const applySkill = (skillId: string, fields: Partial<BotSkill>) =>
		set({
			skills: state.skills.map((skill) =>
				skill.id === skillId ? { ...skill, ...fields } : skill,
			),
		})

	const readHistory = async (spaceId: string) =>
		set({
			commits: await store.spacePluginHistory(spaceId),
			hasFailedToLoad: false,
		})

	const openSpace = () => state.spaceId ?? ""

	const readFiles = createHistoryFilesReader(
		(oldestCommitId, newestCommitId) =>
			store.spacePluginHistoryDiff(openSpace(), oldestCommitId, newestCommitId),
		{ run: (task) => run(() => task()), getState: () => state, setState: set },
	)

	const files = createSkillFilesController(
		{
			read: (skillId, path) =>
				store.spacePluginSkillFile(openSpace(), skillId, path),
			write: (skillId, path, text) =>
				store.writeSpacePluginSkillFile(openSpace(), skillId, path, text),
			remove: (skillId, path) =>
				store.deleteSpacePluginSkillFile(openSpace(), skillId, path),
		},
		{
			run: (task) => run(() => task()),
			getFile: () => state.file,
			setFile: (file) => set({ file }),
			getSkills: () => state.skills,
			applySkill,
		},
	)

	return {
		...files,
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		open: (spaceId: string) =>
			enqueue(() => read(spaceId)).catch(noteFailedRead),

		reload,

		createSkill: (draft: BotSkillDraft, isPreloaded: boolean) =>
			run(async (spaceId) => {
				const created = await store.createSpacePluginSkill(spaceId, draft)
				const skill = isPreloaded
					? await store.setSpacePluginSkillPreloaded(spaceId, created.id, true)
					: created
				set({ skills: [...state.skills, skill] })
				await readHistory(spaceId)
			}),

		saveSkill: (skillId: string, draft: BotSkillDraft) =>
			run(async (spaceId) => {
				const saved = await store.updateSpacePluginSkill(
					spaceId,
					skillId,
					draft,
				)
				applySkill(skillId, saved)
				files.carryFile(skillId, saved.id)
				await readHistory(spaceId)
			}),

		setSkillPreloaded: (skillId: string, isPreloaded: boolean) => {
			applySkill(skillId, { isPreloaded })
			run(async (spaceId) => {
				applySkill(
					skillId,
					await store.setSpacePluginSkillPreloaded(
						spaceId,
						skillId,
						isPreloaded,
					),
				)
				await readHistory(spaceId)
			})
		},

		removeSkill: (skillId: string) =>
			run(async (spaceId) => {
				await store.deleteSpacePluginSkill(spaceId, skillId)
				set({ skills: state.skills.filter((skill) => skill.id !== skillId) })
				await readHistory(spaceId)
			}),

		openFiles: (oldestCommitId: string, newestCommitId: string) => {
			if (state.spaceId) {
				readFiles(oldestCommitId, newestCommitId)
			}
		},

		revert: (oldestCommitId: string, newestCommitId: string) =>
			run(async (spaceId) => {
				set({
					commits: await store.revertSpacePlugin(
						spaceId,
						oldestCommitId,
						newestCommitId,
					),
				})
				set({ skills: await store.spacePluginSkills(spaceId) })
			}),
	}
}
