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

export type UserPluginState = HistoryFilesState & {
	skills: BotSkill[]
	commits: BotHistoryEntry[]
	hasFailedToLoad: boolean
	file: OpenedSkillFile | null
}

export type UserPluginController = SkillFilesController & {
	getState: () => UserPluginState
	subscribe: (listener: () => void) => () => void
	open: () => Promise<void>
	reload: () => void
	createSkill: (draft: BotSkillDraft, isPreloaded: boolean) => void
	saveSkill: (skillId: string, draft: BotSkillDraft) => void
	setSkillPreloaded: (skillId: string, isPreloaded: boolean) => void
	removeSkill: (skillId: string) => void
	openFiles: (oldestCommitId: string, newestCommitId: string) => void
	revert: (oldestCommitId: string, newestCommitId: string) => void
}

export const initialUserPluginState: UserPluginState = {
	...initialHistoryFilesState,
	skills: [],
	commits: [],
	hasFailedToLoad: false,
	file: null,
}

export const createUserPluginController = (
	store: TranscriptStore,
): UserPluginController => {
	let state = initialUserPluginState
	const listeners = new Set<() => void>()

	const enqueue = createQueue()

	const set = (fields: Partial<UserPluginState>) => {
		state = { ...state, ...fields }
		for (const listener of listeners) {
			listener()
		}
	}

	const read = async () => {
		const [skills, commits] = await Promise.all([
			store.userPluginSkills(),
			store.userPluginHistory(),
		])
		set({ skills, commits, hasFailedToLoad: false })
	}

	const noteFailedRead = () => set({ hasFailedToLoad: true })

	const reload = () => {
		void enqueue(read).catch(noteFailedRead)
	}

	const run = (task: () => Promise<void>) => {
		void enqueue(task).catch(reload)
	}

	const applySkill = (skillId: string, fields: Partial<BotSkill>) =>
		set({
			skills: state.skills.map((skill) =>
				skill.id === skillId ? { ...skill, ...fields } : skill,
			),
		})

	const readHistory = async () =>
		set({ commits: await store.userPluginHistory(), hasFailedToLoad: false })

	const readFiles = createHistoryFilesReader(
		(oldestCommitId, newestCommitId) =>
			store.userPluginHistoryDiff(oldestCommitId, newestCommitId),
		{ run, getState: () => state, setState: set },
	)

	const files = createSkillFilesController(
		{
			read: (skillId, path) => store.userPluginSkillFile(skillId, path),
			write: (skillId, path, text) =>
				store.writeUserPluginSkillFile(skillId, path, text),
			remove: (skillId, path) => store.deleteUserPluginSkillFile(skillId, path),
		},
		{
			run,
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

		open: () => enqueue(read).catch(noteFailedRead),

		reload,

		createSkill: (draft: BotSkillDraft, isPreloaded: boolean) =>
			run(async () => {
				const created = await store.createUserPluginSkill(draft)
				const skill = isPreloaded
					? await store.setUserPluginSkillPreloaded(created.id, true)
					: created
				set({ skills: [...state.skills, skill] })
				await readHistory()
			}),

		saveSkill: (skillId: string, draft: BotSkillDraft) =>
			run(async () => {
				const saved = await store.updateUserPluginSkill(skillId, draft)
				applySkill(skillId, saved)
				files.carryFile(skillId, saved.id)
				await readHistory()
			}),

		setSkillPreloaded: (skillId: string, isPreloaded: boolean) => {
			applySkill(skillId, { isPreloaded })
			run(async () => {
				applySkill(
					skillId,
					await store.setUserPluginSkillPreloaded(skillId, isPreloaded),
				)
				await readHistory()
			})
		},

		removeSkill: (skillId: string) =>
			run(async () => {
				await store.deleteUserPluginSkill(skillId)
				set({ skills: state.skills.filter((skill) => skill.id !== skillId) })
				await readHistory()
			}),

		openFiles: readFiles,

		revert: (oldestCommitId: string, newestCommitId: string) =>
			run(async () => {
				set({
					commits: await store.revertUserPlugin(oldestCommitId, newestCommitId),
				})
				set({ skills: await store.userPluginSkills() })
			}),
	}
}
