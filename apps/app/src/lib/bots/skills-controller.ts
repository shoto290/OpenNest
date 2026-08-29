import {
	createSkillFilesController,
	type OpenedSkillFile,
	type SkillFilesController,
} from "./skill-files-controller"

import { createQueue } from "../queue"
import type { BotSkill, BotSkillDraft } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type SkillsState = {
	botId: string | null
	skills: BotSkill[]
	file: OpenedSkillFile | null
}

export type SkillsController = SkillFilesController & {
	getState: () => SkillsState
	subscribe: (listener: () => void) => () => void
	open: (botId: string) => Promise<void>
	reload: () => void
	create: (draft: BotSkillDraft, isPreloaded: boolean) => void
	save: (skillId: string, draft: BotSkillDraft) => void
	setPreloaded: (skillId: string, isPreloaded: boolean) => void
	remove: (skillId: string) => void
}

export const initialSkillsState: SkillsState = {
	botId: null,
	skills: [],
	file: null,
}

export const createSkillsController = (
	store: TranscriptStore,
): SkillsController => {
	let state = initialSkillsState
	const listeners = new Set<() => void>()

	const enqueue = createQueue()

	const publish = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const set = (fields: Partial<SkillsState>) => {
		state = { ...state, ...fields }
		publish()
	}

	const applyTo = (botId: string, skills: BotSkill[]) => {
		if (state.botId === botId) {
			set({ skills })
		}
	}

	const read = async (botId: string) =>
		applyTo(botId, await store.botSkills(botId))

	const reload = () => {
		const botId = state.botId
		if (botId) {
			void enqueue(() => read(botId)).catch(() => undefined)
		}
	}

	const applySkill = (skillId: string, fields: Partial<BotSkill>) =>
		set({
			skills: state.skills.map((skill) =>
				skill.id === skillId ? { ...skill, ...fields } : skill,
			),
		})

	const onOpenBot = (run: (botId: string) => Promise<void>) => {
		const botId = state.botId
		if (botId) {
			void enqueue(() => run(botId)).catch(reload)
		}
	}

	const openBot = () => state.botId ?? ""

	const files = createSkillFilesController(
		{
			read: (skillId, path) => store.botSkillFile(openBot(), skillId, path),
			write: (skillId, path, text) =>
				store.writeBotSkillFile(openBot(), skillId, path, text),
			remove: (skillId, path) =>
				store.deleteBotSkillFile(openBot(), skillId, path),
		},
		{
			run: (task) => onOpenBot(() => task()),
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

		open: (botId: string) => {
			set({ botId, skills: [], file: null })
			return enqueue(() => read(botId)).catch(() => undefined)
		},

		reload,

		create: (draft: BotSkillDraft, isPreloaded: boolean) =>
			onOpenBot(async (botId) => {
				const created = await store.createBotSkill(botId, draft)
				const skill = isPreloaded
					? await store.setBotSkillPreloaded(botId, created.id, true)
					: created
				applyTo(botId, [...state.skills, skill])
			}),

		save: (skillId: string, draft: BotSkillDraft) =>
			onOpenBot(async (botId) => {
				const saved = await store.updateBotSkill(botId, skillId, draft)
				applySkill(skillId, saved)
				files.carryFile(skillId, saved.id)
			}),

		setPreloaded: (skillId: string, isPreloaded: boolean) => {
			applySkill(skillId, { isPreloaded })
			onOpenBot(async (botId) =>
				applySkill(
					skillId,
					await store.setBotSkillPreloaded(botId, skillId, isPreloaded),
				),
			)
		},

		remove: (skillId: string) =>
			onOpenBot(async (botId) => {
				await store.deleteBotSkill(botId, skillId)
				applyTo(
					botId,
					state.skills.filter((skill) => skill.id !== skillId),
				)
			}),
	}
}
