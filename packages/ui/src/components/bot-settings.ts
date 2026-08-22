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

/** How hard the model is asked to think on a skill's turn. */
type BotSkillEffort = (typeof SKILL_EFFORTS)[number]

const SKILL_EFFORTS = ["low", "medium", "high"] as const

/** Whether the skill runs in the conversation it was reached from or in a copy of
 * it. A fork is the only context that has a runner of its own, which is why an agent
 * and a background run are only asked for there. */
type BotSkillContext = (typeof SKILL_CONTEXTS)[number]

const SKILL_CONTEXTS = ["shared", "fork"] as const

/** What a skill is written with, whole — both to create one and to change one.
 *
 * Everything past the name, the description and the body is frontmatter a skill may
 * leave out, so every one of them is optional: a skill of three fields is a complete
 * skill, and the rest are answers a reader gives once they need them. The preload
 * mark rides along rather than being set on its own — the editor saves on a press
 * now, so what the bot was told and what the skill says are written in one go. */
type BotSkillDraft = {
	name: string
	description: string
	body: string
	/** The sentence the bot reads beside the description to decide whether this is
	 * the skill for the turn. It shares the description's budget. */
	whenToUse?: string
	/** What a reader who invokes the skill by hand is prompted with. */
	argumentHint?: string
	/** The arguments the skill takes, as its own format spells them. */
	arguments?: string
	/** Whether the body is carried into the bot's prompt on every turn. */
	isPreloaded?: boolean
	/** Whether the bot is kept from reaching for it on its own. */
	isModelInvocationDisabled?: boolean
	/** Whether a reader may invoke it by hand. */
	isUserInvocable?: boolean
	/** The files whose presence makes the skill worth reaching for, one glob a
	 * line. */
	paths?: string
	/** The model this skill's turn runs on. Left empty, it runs on the bot's. */
	model?: string
	effort?: BotSkillEffort
	context?: BotSkillContext
	/** The shell its commands run in. */
	shell?: string
	/** The agent a forked run is handed to. */
	agent?: string
	/** Whether a forked run is left to finish on its own. */
	isBackground?: boolean
	/** The tools the skill's turn may use, one a line. */
	allowedTools?: string
	disallowedTools?: string
	/** What runs around the skill's turn, as its own format spells it. */
	hooks?: string
	license?: string
	/** What this skill needs of the runtime around it. */
	compatibility?: string
	/** Anything the bundle carries that nothing here reads. */
	metadata?: string
}

/** What a skill's marks mean when its frontmatter says nothing about them. A skill
 * is invocable by hand and a forked run is left to finish on its own unless the file
 * says otherwise, so a switch showing anything else would be telling a reader their
 * skill does something it does not.
 *
 * They are the resting state of a switch, not a value to write: a mark standing
 * where a file that never carried the key put it stays out of the file. */
const SKILL_FLAG_DEFAULTS = {
	isModelInvocationDisabled: false,
	isUserInvocable: true,
	isBackground: true,
} as const

/** A skill nobody has written yet: the resting state of the editor, and what a
 * creation is compared against to know whether anything was typed. */
const BLANK_SKILL_DRAFT: BotSkillDraft = {
	name: "",
	description: "",
	body: "",
	isPreloaded: false,
	...SKILL_FLAG_DEFAULTS,
}

/** How much of a skill's frontmatter the description and the sentence beside it may
 * take together, in characters. The two are read as one paragraph when the bot
 * decides whether to reach for the skill, so they are budgeted as one. */
const SKILL_DESCRIPTION_LIMIT = 1536

/** What the description and `when_to_use` take of that budget, together. */
const toSkillDescriptionLength = (draft: BotSkillDraft) =>
	draft.description.length + (draft.whenToUse?.length ?? 0)

/** A field nobody answered, whichever shape its answer takes. An empty string and a
 * missing key are one state: the skill does not say. A switch always says something
 * — off is an answer a reader gave, and a draft that differs only by a mark taken
 * down is a draft with something to save. */
const isSkillFieldAnswered = (value: unknown) =>
	value !== undefined && value !== ""

/** Whether two drafts say the same thing, so an editor can tell an untouched skill
 * from one with something to save. Compared field by field over what either of them
 * answers — a field typed and cleared again is back to unanswered rather than
 * different. */
const isSameSkillDraft = (a: BotSkillDraft, b: BotSkillDraft) => {
	const left = toAnsweredFields(a)
	const right = toAnsweredFields(b)
	const fields = Object.keys(left)

	return (
		fields.length === Object.keys(right).length &&
		fields.every((field) => left[field] === right[field])
	)
}

/** Whether a draft has anything to save: what is being written weighed against what
 * is kept, and against a skill nobody has written yet for a creation. */
const isSkillDraftUnsaved = (draft: BotSkillDraft, saved?: BotSkillDraft) =>
	!isSameSkillDraft(draft, saved ?? BLANK_SKILL_DRAFT)

const toAnsweredFields = (draft: BotSkillDraft): Record<string, unknown> =>
	Object.fromEntries(
		Object.entries(draft).filter(([, value]) => isSkillFieldAnswered(value)),
	)

/** A name in a bot's bundle reduced to what the bundle accepts: lowercase letters,
 * numbers and hyphens. It is an identifier rather than a title — a skill's directory
 * is refused outright for anything else, and a server's name is the key it is
 * declared and connected under — so the field writes what a reader types into the
 * only shape it may take instead of letting them find out from a broken bundle. What
 * the bot reads to decide when to reach for a skill is its description, not this. */
const toBundleName = (value: string) =>
	value.toLowerCase().replace(/[^a-z0-9-]+/g, "-")

/** A skill of the bot's, as the panel lists and edits it. `id` is its identity and
 * never moves: renaming a skill is free text changing, so every write is addressed
 * by the id and never by the name. */
type BotSkillItem = BotSkillDraft & {
	id: string
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

/** What the store will take as a configuration, and what this side will read one
 * out of: an object, and nothing an array or a bare value could be mistaken for. */
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
	/** Whether the bot is denied the tools that edit files and run commands. */
	changesNothing: boolean
}

export {
	BLANK_SKILL_DRAFT,
	BLOT_TINTS,
	BOT_IDENTITY_ANIMALS,
	type BotAvatarBlot,
	type BotIdentity,
	type BotMcpServerDraft,
	type BotMcpServerItem,
	type BotModelOption,
	type BotSettingsValue,
	type BotSkillContext,
	type BotSkillDraft,
	type BotSkillEffort,
	type BotSkillItem,
	isConfigObject,
	isSkillDraftUnsaved,
	parseMcpServerConfig,
	SKILL_CONTEXTS,
	SKILL_DESCRIPTION_LIMIT,
	SKILL_EFFORTS,
	SKILL_FLAG_DEFAULTS,
	toBundleName,
	toMcpServerConfigText,
	toSkillDescriptionLength,
}
