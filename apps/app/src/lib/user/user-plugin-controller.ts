import { createQueue } from "../queue"
import type { BotCommit } from "../bots/history-controller"
import {
	createSkillFilesController,
	type OpenedSkillFile,
	type SkillFilesController,
} from "../bots/skill-files-controller"
import type { BotSkill, BotSkillDraft } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type UserPluginState = {
	skills: BotSkill[]
	commits: BotCommit[]
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
	loadDiff: (commitId: string) => void
	revert: (commitId: string) => void
}

export const initialUserPluginState: UserPluginState = {
	skills: [],
	commits: [],
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
		set({ skills, commits })
	}

	const reload = () => {
		void enqueue(read).catch(() => undefined)
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
		set({ commits: await store.userPluginHistory() })

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

		open: () => enqueue(read).catch(() => undefined),

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

		loadDiff: (commitId: string) => {
			const known = state.commits.find((commit) => commit.id === commitId)
			if (known?.diff !== undefined) {
				return
			}
			run(async () => {
				const diff = await store.userPluginHistoryDiff(commitId)
				set({
					commits: state.commits.map((commit) =>
						commit.id === commitId ? { ...commit, diff } : commit,
					),
				})
			})
		},

		revert: (commitId: string) =>
			run(async () => {
				set({ commits: await store.revertUserPlugin(commitId) })
				set({ skills: await store.userPluginSkills() })
			}),
	}
}
