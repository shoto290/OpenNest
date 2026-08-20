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
}
