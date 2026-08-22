import { createQueue } from "../queue"
import type { BotSkill, BotSkillDraft } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type SkillsState = {
	/** The bot the skills on hand belong to. `null` is a reader who owns no bot,
	 * which is the only state with nothing to read. */
	botId: string | null
	/** Every skill in that bot's bundle, as the store answered it. */
	skills: BotSkill[]
}

export type SkillsController = {
	getState: () => SkillsState
	subscribe: (listener: () => void) => () => void
	/** The bot's skills, read and shown. Called again for the same bot re-reads it:
	 * a bundle a hand wrote into is a bundle this side never heard about. */
	open: (botId: string) => Promise<void>
	/** A skill, whole, at a directory the store picks. The answer carries the id it
	 * chose, which is what every write below is addressed by — including the mark,
	 * which is a second write because there is no id to address it by until the
	 * first one has answered. */
	create: (draft: BotSkillDraft, isPreloaded: boolean) => void
	/** What the skill says, written when the editor reports a save and never as it
	 * is typed: one write, carrying every frontmatter key the draft holds. A skill is
	 * a file with a frontmatter, and half a written key is not a state worth
	 * keeping. */
	save: (skillId: string, draft: BotSkillDraft) => void
	/** Whether the body is carried into the bot's prompt. Its own write: this is what
	 * the bot was told changing, not what the skill says. */
	setPreloaded: (skillId: string, isPreloaded: boolean) => void
	remove: (skillId: string) => void
}

export const initialSkillsState: SkillsState = { botId: null, skills: [] }

export const createSkillsController = (
	store: TranscriptStore,
): SkillsController => {
	let state = initialSkillsState
	const listeners = new Set<() => void>()

	/** Every call in the order it was asked for: a create that landed while the read
	 * was in flight would otherwise be overwritten by an answer that predates it. */
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

	/** The store's own answer, applied only while the bot it was read for is still
	 * the one on hand: a reader who moved on is owed the roster they moved to. */
	const applyTo = (botId: string, skills: BotSkill[]) => {
		if (state.botId === botId) {
			set({ skills })
		}
	}

	const read = async (botId: string) =>
		applyTo(botId, await store.botSkills(botId))

	/** What the record holds, read again. It is where a refused write lands: neither
	 * the panel nor this has anywhere to say a save did not go through, so the
	 * reader ends up on what the bundle really holds. */
	const reload = () => {
		const botId = state.botId
		if (botId) {
			void enqueue(() => read(botId)).catch(() => undefined)
		}
	}

	/** The store's own answer for one skill, applied to the roster on hand. */
	const applySkill = (skillId: string, fields: Partial<BotSkill>) =>
		set({
			skills: state.skills.map((skill) =>
				skill.id === skillId ? { ...skill, ...fields } : skill,
			),
		})

	/** A write against the bot on hand, or nothing at all: there is no skill to
	 * address while no bot is open. */
	const onOpenBot = (run: (botId: string) => Promise<void>) => {
		const botId = state.botId
		if (botId) {
			void enqueue(() => run(botId)).catch(reload)
		}
	}

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		open: (botId: string) => {
			// The list belongs to the bundle it was read in. Two bots may hold a skill
			// in a directory of the same name, so leaving it up is how one bot's skill
			// ends up read as the other's.
			set({ botId, skills: [] })
			return enqueue(() => read(botId)).catch(() => undefined)
		},

		create: (draft: BotSkillDraft, isPreloaded: boolean) =>
			onOpenBot(async (botId) => {
				const created = await store.createBotSkill(botId, draft)
				const skill = isPreloaded
					? await store.setBotSkillPreloaded(botId, created.id, true)
					: created
				applyTo(botId, [...state.skills, skill])
			}),

		save: (skillId: string, draft: BotSkillDraft) =>
			onOpenBot(async (botId) =>
				applySkill(skillId, await store.updateBotSkill(botId, skillId, draft)),
			),

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
