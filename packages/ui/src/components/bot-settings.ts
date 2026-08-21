import {
	BLOT_TINTS,
	type BotAvatarBlot,
} from "@workspace/ui/components/bot-avatar"
import {
	ANIMALS,
	type BotAvatarAnimal,
} from "@workspace/ui/components/bot-avatar-animals"

const BOT_IDENTITY_ANIMALS = Object.keys(ANIMALS) as BotAvatarAnimal[]

type BotIdentity = {
	animal: BotAvatarAnimal
	/** The tint drawn behind the animal. Left out, the bot wears no blot. */
	blot?: BotAvatarBlot
	/** An uploaded picture. It wins over the animal and hides its blot, so the
	 * liveness the animal carries moves to an activity dot. */
	image?: string
}

type BotModelOption = {
	label: string
	value: string
}

/** What a skill is written with, whole — both to create one and to change one. The
 * preload mark is not here: it is set on its own, because it changes what the bot
 * was told rather than what the skill says. */
type BotSkillDraft = {
	name: string
	description: string
	body: string
}

/** A skill of the bot's, as the panel lists and edits it. `id` is its identity and
 * never moves: renaming a skill is free text changing, so every write is addressed
 * by the id and never by the name. */
type BotSkillItem = BotSkillDraft & {
	id: string
	/** Whether the body is carried into the bot's prompt on every turn. */
	isPreloaded: boolean
}

type BotSettingsValue = {
	identity: BotIdentity
	name: string
	/** The short role label, one line. */
	title: string
	/** The system prompt the bot always runs with. */
	instructions: string
	model: string
	workingDirectory: string
}

export {
	BLOT_TINTS,
	BOT_IDENTITY_ANIMALS,
	type BotAvatarBlot,
	type BotIdentity,
	type BotModelOption,
	type BotSettingsValue,
	type BotSkillDraft,
	type BotSkillItem,
}
