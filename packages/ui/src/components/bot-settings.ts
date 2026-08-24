import {
	BLOT_TINTS,
	type BotAvatarBlot,
} from "@workspace/ui/components/bot-avatar"
import {
	ANIMALS,
	type BotAvatarAnimal,
} from "@workspace/ui/components/bot-avatar-animals"

/** The one animal the picker never offers: a bot is given it rather than
 * choosing it. */
const UNPICKABLE_ANIMAL = "skippy"

type BotIdentityAnimal = Exclude<BotAvatarAnimal, typeof UNPICKABLE_ANIMAL>

const BOT_IDENTITY_ANIMALS = (Object.keys(ANIMALS) as BotAvatarAnimal[]).filter(
	(animal): animal is BotIdentityAnimal => animal !== UNPICKABLE_ANIMAL,
)

/** The animal a bot is drawn as: the one it keeps, unless it is called Skippy —
 * that one is given rather than chosen, so it is read off the name every time it is
 * drawn. The name it answers to is the animal's own id, deliberately: there is one
 * Skippy, and a bot called after it wears its face.
 *
 * Nothing is written: renaming a bot either way changes its face on the next render
 * and leaves the animal it stores exactly where it was. */
const drawnAnimal = <Stored extends BotAvatarAnimal | undefined>(
	name: string | undefined,
	animal: Stored,
) =>
	name?.trim().toLowerCase() === UNPICKABLE_ANIMAL ? UNPICKABLE_ANIMAL : animal

type BotIdentity = {
	animal: BotIdentityAnimal
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

/** How the bot writes its answers, as the host stores it raw: the concise style it
 * is given by default, and Claude's own. Two answers rather than free text — the
 * value is written into the host's settings as it stands here. */
type BotOutputStyle = (typeof BOT_OUTPUT_STYLES)[number]

const BOT_OUTPUT_STYLES = ["Concise", "default"] as const

/** The style a bot writes in until somebody says otherwise. */
const DEFAULT_BOT_OUTPUT_STYLE: BotOutputStyle = "Concise"

/** What the host holds, read as a style the panel can show. Anything it does not
 * know is read as the default one. */
const readBotOutputStyle = (value: string): BotOutputStyle =>
	BOT_OUTPUT_STYLES.find((style) => style === value) ?? DEFAULT_BOT_OUTPUT_STYLE

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
	/** Whether the host wrote this skill rather than the reader. A system skill is
	 * listed and opened like any other, and read there rather than edited: its body
	 * is regenerated, so anything typed into it would be written over. */
	isSystem: boolean
}

/** Who wrote a commit into the bundle: the reader themself, or the bot on a run.
 * Two answers rather than a free name — the panel has one name to put on each,
 * and the bot's is the bot's own. */
type BotCommitAuthor = "user" | "bot"

/** One commit of the bot's bundle, as the history lists it. The title is the line a
 * non-developer reads first and the body is what it meant; `diff` is the unified
 * diff, absent until the host answers the panel's request for it, so an expanded
 * commit with none yet is a commit still loading rather than an empty one. */
type BotCommitItem = {
	id: string
	/** When it landed, in milliseconds. Read as a distance from now. */
	at: number
	author: BotCommitAuthor
	title: string
	body: string
	diff?: string
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

/** Where the server runs: one started on the reader's own machine, or one already
 * running somewhere and reached over the network. It is the question the rest of the
 * configuration answers — a local server names a command, a remote one names an
 * address — so it is asked first and it decides which fields stand under it. */
type BotMcpTransport = (typeof MCP_TRANSPORTS)[number]

const MCP_TRANSPORTS = ["local", "remote"] as const

/** The keys each transport is the only one to name, and which leave the
 * configuration the moment the other one is picked: a remote server has no command to
 * run and a local one has no headers to send, nor a kind of endpoint to reach. Every
 * key neither of them names is none of their business and stays exactly where it
 * was. */
const MCP_TRANSPORT_KEYS = {
	local: ["command", "args"],
	remote: ["url", "type", "headers"],
} as const satisfies Record<BotMcpTransport, readonly string[]>

/** The kinds of endpoint a remote server is reached on, as a reader picks one. */
type BotMcpEndpointKind = (typeof MCP_ENDPOINT_KINDS)[number]

const MCP_ENDPOINT_KINDS = ["http", "sse", "ws"] as const

/** Every `type` a remote server is reached by, the other spelling of an HTTP endpoint
 * included: a file already carrying `streamable-http` keeps it, since the two mean one
 * thing to the runtime and rewriting somebody's configuration over a spelling is not
 * this editor's business. `stdio` is not one of them — it is what a configuration
 * naming no type at all is read as. */
const MCP_ENDPOINT_TYPES = [...MCP_ENDPOINT_KINDS, "streamable-http"]

const isMcpEndpointType = (value: unknown) =>
	MCP_ENDPOINT_TYPES.some((type) => type === readConfigText(value))

/** The kind of endpoint a configuration names, as the field asks for it. It stands on
 * HTTP for a configuration naming none and for the alias, which is the same endpoint
 * under its other name. */
const readMcpEndpointKind = (value: unknown): BotMcpEndpointKind =>
	MCP_ENDPOINT_KINDS.find((kind) => kind === readConfigText(value)) ?? "http"

/** A server being written. Its configuration is text rather than an object because
 * half-typed JSON is not one — the editor holds what the reader typed and parses it
 * on every keystroke, so an unfinished brace is a message rather than a lost field.
 *
 * The transport rides beside it rather than being read out of it: a remote server
 * whose address is still empty names nothing, and a transport derived from the keys
 * would flip back under the reader the moment they picked it. */
type BotMcpServerDraft = {
	name: string
	transport: BotMcpTransport
	config: string
}

/** A server nobody has written yet: the resting state of the editor. The
 * configuration opens empty, because the fields under Connection now name the shape
 * a reader used to have to know. */
const BLANK_MCP_SERVER_DRAFT: BotMcpServerDraft = {
	name: "",
	transport: "local",
	config: "{}",
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

/** A key the configuration names as text, or nothing for a key it leaves out: a
 * missing key and an empty field are one state to a reader. */
const readConfigText = (value: unknown) =>
	typeof value === "string" ? value : ""

/** A key the configuration names as a list, kept to the entries that are text. */
const readConfigList = (value: unknown) =>
	Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: []

/** A key the configuration names as an object of names and values — an environment,
 * a set of headers. Anything that is not text is shown as the JSON it is, so a value
 * this side does not expect is still readable rather than gone. */
const readConfigPairs = (value: unknown) =>
	isConfigObject(value)
		? Object.entries(value).map(([name, entry]) => ({
				name,
				value: typeof entry === "string" ? entry : JSON.stringify(entry),
			}))
		: []

/** Where a name stops and its value starts on a line a reader typed. Either notation
 * is taken — an environment is written `NAME=value` and a header `Name: value` — so a
 * line pasted from a server's own instructions is read as it was copied. */
const PAIR_SEPARATOR = /[:=]/

const fromLines = (text: string) =>
	text
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)

const toPairLines = (value: unknown, separator: string) =>
	readConfigPairs(value)
		.map((pair) => `${pair.name}${separator}${pair.value}`)
		.join("\n")

const fromPairLines = (text: string) =>
	Object.fromEntries(
		fromLines(text).map((line) => {
			const at = line.search(PAIR_SEPARATOR)

			return at === -1
				? [line, ""]
				: [line.slice(0, at).trim(), line.slice(at + 1).trim()]
		}),
	)

/** The handful of keys the editor names with a field of its own, as text: a field is
 * something a reader types into, whatever shape the configuration keeps the answer
 * in. Everything else a configuration holds is only ever read as JSON. */
type BotMcpServerFields = {
	command: string
	args: string
	url: string
	type: string
	headers: string
	environment: string
}

/** Which key of the configuration each field answers. The environment is the one
 * whose field and key are named differently: `env` is what the format writes, and
 * nothing else in the app is called that. */
const MCP_FIELD_KEYS = {
	command: "command",
	args: "args",
	url: "url",
	type: "type",
	headers: "headers",
	environment: "env",
} as const satisfies Record<keyof BotMcpServerFields, string>

const readMcpServerFields = (
	config: Record<string, unknown>,
): BotMcpServerFields => ({
	command: readConfigText(config.command),
	args: readConfigList(config.args).join("\n"),
	url: readConfigText(config.url),
	type: readConfigText(config.type),
	headers: toPairLines(config.headers, ": "),
	environment: toPairLines(config.env, "="),
})

const toFieldValue = (
	field: keyof BotMcpServerFields,
	value: string,
): unknown => {
	if (field === "args") return fromLines(value)
	if (field === "headers" || field === "environment")
		return fromPairLines(value)

	return value
}

/** Whether two spellings of a field say the same thing to the configuration: a
 * header line still being typed and the same line laid out again are one answer, and
 * an editor can leave the typing alone while they are. */
const isSameFieldAnswer = (
	field: keyof BotMcpServerFields,
	a: string,
	b: string,
) =>
	JSON.stringify(toFieldValue(field, a)) ===
	JSON.stringify(toFieldValue(field, b))

/** Whether an answer says nothing at all, whichever shape it takes. A key that would
 * say nothing is taken out rather than written empty: a configuration is copied
 * around and read by a program, and `"command": ""` is a command. */
const isEmptyAnswer = (value: unknown) =>
	value === "" ||
	(Array.isArray(value) && value.length === 0) ||
	(isConfigObject(value) && Object.keys(value).length === 0)

const withoutKeys = (
	config: Record<string, unknown>,
	keys: readonly string[],
): Record<string, unknown> =>
	Object.fromEntries(
		Object.entries(config).filter(([key]) => !keys.includes(key)),
	)

/** One field's answer carried back into the configuration it was read out of. Every
 * key no field names is left exactly where it was, because the shape belongs to the
 * transport and this side only ever names a handful of it. */
const toMcpServerConfigWith = (
	config: Record<string, unknown>,
	field: keyof BotMcpServerFields,
	value: string,
): Record<string, unknown> => {
	const key = MCP_FIELD_KEYS[field]
	const answer = toFieldValue(field, value)

	return isEmptyAnswer(answer)
		? withoutKeys(config, [key])
		: { ...config, [key]: answer }
}

/** A remote configuration always names the kind of endpoint it reaches: an address
 * with no `type` beside it is refused outright — the server is skipped and the reader
 * is told to add one — so a remote server that names none is written as the HTTP one
 * it most often is. A kind already named is left exactly as it is written. */
const withMcpEndpointType = (config: Record<string, unknown>) =>
	isMcpEndpointType(config.type) ? config : { ...config, type: "http" }

/** The configuration a transport leaves behind once the other one is picked: what
 * only the transport being left names goes, everything else stays, and a remote one
 * gains the kind of endpoint it cannot be reached without. */
const toMcpServerConfigFor = (
	config: Record<string, unknown>,
	transport: BotMcpTransport,
) => {
	const kept = withoutKeys(
		config,
		transport === "remote"
			? MCP_TRANSPORT_KEYS.local
			: MCP_TRANSPORT_KEYS.remote,
	)

	return transport === "remote" ? withMcpEndpointType(kept) : kept
}

/** Which transport a configuration was written for. The kind of endpoint answers it
 * outright where it is named; past that it is read off the keys — an address is only
 * a remote server's and a command only a local one's. A configuration naming neither
 * says nothing about which of the two a reader picked, so it is left on the one they
 * are already on. */
const readMcpServerTransport = (
	config: Record<string, unknown>,
	current: BotMcpTransport = "local",
): BotMcpTransport => {
	if (isMcpEndpointType(config.type)) return "remote"
	if (readConfigText(config.url)) return "remote"
	if (readConfigText(config.command) || readConfigList(config.args).length > 0)
		return "local"

	return current
}

/** A server as it is kept, opened for writing. */
const toMcpServerDraft = (server: BotMcpServerItem): BotMcpServerDraft => ({
	name: server.name,
	transport: readMcpServerTransport(server.config),
	config: toMcpServerConfigText(server.config),
})

/** The configuration that would be written, which is not always the one on screen: a
 * remote server is written with the kind of endpoint it is reached by, whether or not
 * the text names one yet. */
const toMcpServerWrittenConfig = (
	config: Record<string, unknown>,
	transport: BotMcpTransport,
) => (transport === "remote" ? withMcpEndpointType(config) : config)

/** A configuration as one word, with its keys in a fixed order at every depth: a
 * field answered again writes its key back at the end of the object, so two
 * configurations saying the same thing in another order are the same configuration. */
const toOrderedValue = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(toOrderedValue)
	if (!isConfigObject(value)) return value

	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, toOrderedValue(value[key])]),
	)
}

const toComparableConfig = (config: Record<string, unknown>) =>
	JSON.stringify(toOrderedValue(config))

/** Whether a draft has anything to save, weighed against the server it was opened
 * on: what would be written against what is kept. A server nobody has written yet
 * always has — there is nothing kept to be the same as — and so has a remote one
 * whose file is missing the type it cannot be reached without. The text itself is
 * never compared, only what it says: it is laid out again every time a field is
 * answered, and a re-indent is not something to save. */
const isMcpServerDraftUnsaved = (
	draft: BotMcpServerDraft,
	saved?: BotMcpServerDraft,
) => {
	if (!saved || draft.name !== saved.name) return true

	const config = parseMcpServerConfig(draft.config)
	const kept = parseMcpServerConfig(saved.config)

	if (!config || !kept) return true

	return (
		toComparableConfig(toMcpServerWrittenConfig(config, draft.transport)) !==
		toComparableConfig(kept)
	)
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
	/** Whether the bot is denied the tools that edit files and run commands. */
	changesNothing: boolean
}

export {
	BLANK_MCP_SERVER_DRAFT,
	BLANK_SKILL_DRAFT,
	BLOT_TINTS,
	BOT_IDENTITY_ANIMALS,
	BOT_OUTPUT_STYLES,
	type BotAvatarBlot,
	type BotCommitAuthor,
	type BotCommitItem,
	type BotIdentity,
	type BotMcpServerDraft,
	type BotMcpServerFields,
	type BotMcpServerItem,
	type BotMcpTransport,
	type BotModelOption,
	type BotOutputStyle,
	type BotSettingsValue,
	type BotSkillContext,
	type BotSkillDraft,
	type BotSkillEffort,
	type BotSkillItem,
	DEFAULT_BOT_OUTPUT_STYLE,
	drawnAnimal,
	isConfigObject,
	isMcpServerDraftUnsaved,
	isSameFieldAnswer,
	isSkillDraftUnsaved,
	MCP_ENDPOINT_KINDS,
	MCP_TRANSPORTS,
	parseMcpServerConfig,
	readBotOutputStyle,
	readConfigList,
	readConfigPairs,
	readConfigText,
	readMcpEndpointKind,
	readMcpServerFields,
	readMcpServerTransport,
	SKILL_CONTEXTS,
	SKILL_DESCRIPTION_LIMIT,
	SKILL_EFFORTS,
	SKILL_FLAG_DEFAULTS,
	toBundleName,
	toMcpServerConfigFor,
	toMcpServerConfigText,
	toMcpServerConfigWith,
	toMcpServerDraft,
	toMcpServerWrittenConfig,
	toSkillDescriptionLength,
}
