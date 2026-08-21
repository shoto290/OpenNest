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

/** A skill name reduced to what the skill format accepts: lowercase letters,
 * numbers and hyphens. It is an identifier rather than a title — the file is refused
 * outright for anything else — so the field writes what a reader types into the only
 * shape it may take instead of letting them find out from a broken skill. What the
 * bot reads to decide when to reach for a skill is its description, not this. */
const toSkillName = (value: string) =>
	value.toLowerCase().replace(/[^a-z0-9-]+/g, "-")

/** A skill of the bot's, as the panel lists and edits it. `id` is its identity and
 * never moves: renaming a skill is free text changing, so every write is addressed
 * by the id and never by the name. */
type BotSkillItem = BotSkillDraft & {
	id: string
	/** Whether the body is carried into the bot's prompt on every turn. */
	isPreloaded: boolean
}

/** An MCP server the bot's bundle declares, as the panel lists and edits it. The
 * name is the identity — it is the key the server is written under — so renaming one
 * moves it, unlike a skill, whose directory holds still. The configuration stays
 * `Record<string, unknown>` all the way to the field: the shape belongs to the
 * transport, and a local server naming a command has nothing in common with a remote
 * one naming a URL. */
type BotMcpServerItem = {
	name: string
	config: Record<string, unknown>
}

/** A server being written. Its configuration is text rather than an object because
 * half-typed JSON is not one — the editor holds what the reader typed and parses it
 * on every keystroke, so an unfinished brace is a message rather than a lost
 * field. */
type BotMcpServerDraft = {
	name: string
	config: string
}

/** A server name reduced to what a configuration key may hold: the bot connects to
 * it under this, and a name carrying spaces or quotes is a key nobody can address.
 * Lowercase letters, numbers and hyphens, like a skill's. */
const toMcpServerName = (value: string) =>
	value.toLowerCase().replace(/[^a-z0-9-]+/g, "-")

const isConfigObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)

/** What the reader typed, read as a configuration, or `null` for anything the store
 * would refuse: text that is not JSON at all, and JSON that is not an object. Both
 * are one answer here because both mean the same thing to the panel — there is
 * nothing to preview and nothing to write. */
const parseMcpServerConfig = (text: string): Record<string, unknown> | null => {
	try {
		const parsed: unknown = JSON.parse(text)
		return isConfigObject(parsed) ? parsed : null
	} catch {
		return null
	}
}

/** A configuration laid out to be read and edited. Indented rather than compact:
 * this is the field a reader checks a command in before it runs on their machine. */
const toMcpServerConfigText = (config: Record<string, unknown>) =>
	JSON.stringify(config, null, 2)

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
	type BotMcpServerDraft,
	type BotMcpServerItem,
	type BotModelOption,
	type BotSettingsValue,
	type BotSkillDraft,
	type BotSkillItem,
	parseMcpServerConfig,
	toMcpServerConfigText,
	toMcpServerName,
	toSkillName,
}
