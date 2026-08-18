import {
	ANIMALS,
	type BotAvatarAnimal,
} from "@workspace/ui/components/bot-avatar-animals"
import {
	BOT_IDENTITY_POSES,
	type BotIdentityPose,
} from "@workspace/ui/components/bot-identity-avatar"

const BOT_IDENTITY_ANIMALS = Object.keys(ANIMALS) as BotAvatarAnimal[]

type BotIdentity = {
	animal: BotAvatarAnimal
	pose: BotIdentityPose
	/** An uploaded picture. It wins over the animal and renders static, so the
	 * liveness the animal carries in its pose moves to an activity dot. */
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
	/** Long free text describing what the bot is for. */
	description: string
	/** The system prompt the bot always runs with. */
	instructions: string
	model: string
	workingDirectory: string
}

const titleCase = (word: string) =>
	`${word.charAt(0).toUpperCase()}${word.slice(1)}`

export {
	BOT_IDENTITY_ANIMALS,
	BOT_IDENTITY_POSES,
	type BotIdentity,
	type BotIdentityPose,
	type BotModelOption,
	type BotSettingsValue,
	titleCase,
}
