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
	 * chose, which is what every write below is addressed by. */
	create: (draft: BotSkillDraft) => void
	/** What the skill says, written as it is typed, one write at a time per skill:
	 * the newest draft waits for the one in flight and every draft in between is
	 * dropped, since each says the same skill less completely than the one after. */
	describe: (skillId: string, draft: BotSkillDraft) => void
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

	/** The skills a write loop is running for, and the newest draft waiting behind
	 * each one. Typing is faster than a round trip. */
	const writing = new Set<string>()
	const pending = new Map<string, BotSkillDraft>()

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

	/** What the reader sees while a write is on its way. The panel is controlled by
	 * this state, so the value has to move on the keystroke rather than on the
	 * answer — a body that waited for the disk would drop characters. */
	const preview = (skillId: string, fields: Partial<BotSkill>) =>
		set({
			skills: state.skills.map((skill) =>
				skill.id === skillId ? { ...skill, ...fields } : skill,
			),
		})

	/** The draft that is still waiting, and then whatever arrived while it was being
	 * written. The answer is applied only once nothing is queued behind it: an answer
	 * to a draft the reader has already typed past would rewind the field they are
	 * in. */
	const flush = async (botId: string, skillId: string): Promise<void> => {
		const draft = pending.get(skillId)
		if (!draft) {
			return
		}
		pending.delete(skillId)
		const written = await store.updateBotSkill(botId, skillId, draft)
		if (!pending.has(skillId) && state.botId === botId) {
			preview(skillId, written)
		}
		return flush(botId, skillId)
	}

	/** A write against the bot on hand, or nothing at all: there is no skill to
	 * address while no bot is open. */
	const onOpenBot = (write: (botId: string) => Promise<void>) => {
		const botId = state.botId
		if (botId) {
			void enqueue(() => write(botId)).catch(reload)
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
			// The list goes with the bot it belonged to: leaving one bot's skills up
			// under another bot's name is the one wrong answer here.
			set({ botId, skills: [] })
			pending.clear()
			return enqueue(() => read(botId)).catch(() => undefined)
		},

		create: (draft: BotSkillDraft) =>
			onOpenBot(async (botId) => {
				const created = await store.createBotSkill(botId, draft)
				applyTo(botId, [...state.skills, created])
			}),

		describe: (skillId: string, draft: BotSkillDraft) => {
			const botId = state.botId
			if (!botId) {
				return
			}
			preview(skillId, draft)
			pending.set(skillId, draft)
			if (writing.has(skillId)) {
				return
			}
			writing.add(skillId)
			void enqueue(() => flush(botId, skillId))
				.catch(reload)
				.finally(() => {
					writing.delete(skillId)
				})
		},

		setPreloaded: (skillId: string, isPreloaded: boolean) => {
			preview(skillId, { isPreloaded })
			onOpenBot(async (botId) => {
				const written = await store.setBotSkillPreloaded(
					botId,
					skillId,
					isPreloaded,
				)
				if (state.botId === botId) {
					preview(skillId, written)
				}
			})
		},

		remove: (skillId: string) =>
			onOpenBot(async (botId) => {
				await store.deleteBotSkill(botId, skillId)
				pending.delete(skillId)
				applyTo(
					botId,
					state.skills.filter((skill) => skill.id !== skillId),
				)
			}),
	}
}
