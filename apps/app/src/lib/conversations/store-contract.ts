/** The label a bot answers under — an alias like `sonnet`, or any other name a
 * model is known by. Free text, and deliberately not a union: which aliases Claude
 * Code resolves is its own to change, there is no listing to read them from, and a
 * label this build refused would be a bot the provider could run and this app could
 * not describe. The aliases the settings offer are a list the frontend holds; a
 * value outside it is stored, read back and displayed as it stands. */
export type BotModel = string

/** The eight animals the avatar engine draws. The host holds the same eight and
 * refuses anything else at the boundary, so a value outside this union never
 * reaches the file. */
export type AvatarAnimal =
	| "cat"
	| "rabbit"
	| "bear"
	| "chick"
	| "dog"
	| "mouse"
	| "owl"
	| "koala"

/** The eight tints a bot may be marked with, named with the vocabulary an agent
 * file's `color` key reads — the word the host stores is the word it writes into the
 * bot's bundle, so nothing is translated on the way and no tint is lost translating.
 * The names moved, the ink did not: `purple` is drawn as the lavender it always was.
 *
 * `null` is a bot marked with none, which is what a bot is until someone marks it —
 * the host holds the same eight and the same absence, so "no mark" never has to be
 * spelled as a ninth word. */
export type AvatarBlot =
	| "red"
	| "yellow"
	| "green"
	| "cyan"
	| "blue"
	| "purple"
	| "pink"
	| "orange"

/** Who a bot is, as the store is told it — whole, both to create one and to
 * change one. No `id` or `createdAt`: neither is a caller's to choose.
 * `avatarImagePath` and `workingDir` are `null` rather than empty, since both name
 * something outside the database.
 *
 * `avatarImagePath` is the host's to hand out and never a caller's to invent: it
 * comes back as an absolute path inside the one directory the host keeps avatars
 * in, and only while the file is still there — a picture that is gone reads as
 * `null`, which is a bot back in its animal. Echo it to keep the picture, send
 * `null` to take it off; a path from anywhere else is stored and then refused on
 * every read, which is the same `null`. `setBotAvatarImage` is how a new one is
 * put on. */
export type BotIdentity = {
	name: string
	title: string
	model: BotModel
	avatarAnimal: AvatarAnimal
	avatarBlot: AvatarBlot | null
	avatarImagePath: string | null
	workingDir: string | null
	/** The system prompt the bot always runs with. Part of the identity because the
	 * settings panel edits it beside the name and emits the two as one value: a
	 * write replaces both, and a field left out is a bot only half described. What a
	 * run leaves behind for the next one is not here — the host keeps it and nothing
	 * on this side reads or writes it. */
	instructions: string
	/** The built-in tools the bot is denied, by name. Part of the identity for the
	 * same reason `instructions` is — the settings panel sets them beside the name —
	 * and the host lays them down in the agent file every run is promoted onto, which
	 * is where a denial takes effect.
	 *
	 * The one thing a caller submits about denials: the switch that holds a bot back
	 * from changing anything is these four names, not a field of its own, so no two
	 * settings write that key. A tool an MCP server provides is never here — a
	 * server's tool is the bundle's own capability, and the host drops one that
	 * arrives anyway. */
	deniedTools: string[]
}

/** A bot as the host answers it: everything it was described with, plus what the
 * host owns — the id it minted, the moment it wrote the row, and the one reading it
 * takes of the denials.
 *
 * `changesNothing` is that reading: true when `deniedTools` covers the tools that
 * write files and run commands. Answered rather than submitted, so a panel shows a
 * switch over the list instead of writing beside it. */
export type Bot = BotIdentity & {
	id: string
	createdAt: number
	changesNothing: boolean
}

/** A skill of a bot's, as the store answers it. It lives in the bot's plugin
 * bundle and nowhere else: no row holds any of this, and a skill a hand dropped into
 * the directory is answered beside the ones the app wrote.
 *
 * `id` is the directory the skill lives in — the one name two of a bot's skills
 * cannot share, and what every write below addresses one by. `name` is free text and
 * changing it moves nothing on the disk.
 *
 * `isPreloaded` is whether the body is carried into the bot's agent file, which is
 * the whole of how a skill reaches a running bot: a skill that is not carried is
 * text on the disk the bot may go and read, and one that is carried is already in
 * its prompt. */
export type BotSkill = BotSkillFront & {
	id: string
	name: string
	description: string
	body: string
	isPreloaded: boolean
}

/** A frontmatter value this app carries without reading into it: `hooks`, `metadata`
 * and `compatibility` are the agent's to define, and narrowing them here would be
 * this app deciding what a file it does not own is allowed to say. */
export type BotSkillValue =
	| string
	| number
	| boolean
	| null
	| BotSkillValue[]
	| { [key: string]: BotSkillValue }

/** Every frontmatter key of a skill past its name and its description, flat beside
 * the rest so a field of a panel is a key of the file.
 *
 * `null` is a key the file does not carry. The four lists are lists here whatever
 * the file spells them as — a `SKILL.md` written by hand carries
 * `allowed-tools: Read, Write` as often as it carries a sequence, and both mean the
 * same two tools. */
export type BotSkillFront = {
	whenToUse: string | null
	argumentHint: string | null
	arguments: string[] | null
	disableModelInvocation: boolean | null
	userInvocable: boolean | null
	allowedTools: string[] | null
	disallowedTools: string[] | null
	model: string | null
	effort: string | null
	context: string | null
	agent: string | null
	background: boolean | null
	hooks: BotSkillValue
	paths: string[] | null
	shell: string | null
	metadata: BotSkillValue
	license: string | null
	compatibility: BotSkillValue
}

/** What a skill is written with, whole — both to create one and to change one. The
 * mark is not here: it is set on its own, because it changes what the bot was told
 * rather than what the skill says.
 *
 * The name, the description and the body are what a skill is, and every save carries
 * all three. Every other key is optional in the strong sense: a key left out is left
 * exactly as the file has it, and a key sent empty is a key asked to go. That is how
 * a panel showing three fields never takes away the seventeen it does not show. */
export type BotSkillDraft = Partial<BotSkillFront> & {
	name: string
	description: string
	body: string
}

/** An MCP server a bot's bundle declares. Like a skill it lives in the bundle and
 * nowhere else: no row holds any of it, and a server file a hand wrote is answered
 * beside what the app wrote.
 *
 * `name` is what it is declared under and what it connects as, and `config` is what
 * the file says, verbatim — a command to run, its arguments and its environment, or
 * whatever else a transport asks for. The shape is the agent's to define, so nothing
 * here narrows it past being an object; the host refuses anything that is not one. */
export type BotMcpServer = {
	name: string
	config: Record<string, unknown>
}

/** Whose gesture a write to a bundle was: the reader's own, or the bot's on a run.
 * Two answers rather than a name — it is the whole of what the history tells apart. */
export type BotHistoryAuthor = "user" | "bot"

/** One write to a bot's bundle, as the host reads it off the repository inside the
 * bundle. No row holds any of it.
 *
 * `timestamp` is seconds since the epoch, which is what a commit itself holds — the
 * panel reads milliseconds, so the conversion is this side's. `id` is what the diff
 * and the undo address one by. */
export type BotHistoryEntry = {
	id: string
	timestamp: number
	author: BotHistoryAuthor
	title: string
	body: string
}

export type Chat = { id: string; createdAt: number; updatedAt: number }

/** A run just opened in a participant's lineage. `seq` is the number the lineage
 * counts handovers with, and what a runtime scope carries as its epoch. */
export type RuntimeSession = {
	id: string
	conversationId: string
	botId: string
	seq: number
	startedAt: number
}

/** The recovery point a later context is rebuilt from. Its summary stays in the
 * file: nothing on this side displays or submits it — the context that carries it
 * is composed by the host. */
export type ContextCheckpoint = {
	id: string
	conversationId: string
	botId: string
	runtimeSessionId: string | null
	lastMessageSeq: number
	tokenCount: number
	createdAt: number
}

export type NewTurn = { id: string; conversationId: string; startedAt: number }

export type NewUserMessage = {
	id: string
	conversationId: string
	turnId: string
	authorBotId: string | null
	repliedToMessageId: string | null
	content: string
	createdAt: number
}

/** The answer opens empty: its text arrives delta by delta, so it carries no
 * content until the store closes it. */
export type NewAssistantMessage = {
	id: string
	conversationId: string
	turnId: string
	authorBotId: string | null
	repliedToMessageId: string | null
	createdAt: number
}

export type StorageFailure =
	| { kind: "appDataDir" }
	| { kind: "journalMode"; mode: string }
	| { kind: "poisonedConnection" }
	| { kind: "callInterrupted" }
	| { kind: "staleWrite" }
	| { kind: "sqlite"; detail: string }

/** Why an uploaded picture was not stored. `unknownFormat` is the bytes not being
 * png, jpeg or webp — whatever the file was called — and `undecodable` is the bytes
 * saying they were and then not being. Only `unwritable` is not the user's to fix by
 * picking another file. */
export type AvatarRejection =
	| { kind: "unknownFormat" }
	| { kind: "tooLarge"; bytes: number; limit: number }
	| { kind: "undecodable"; detail: string }
	| { kind: "unwritable"; detail: string }

export type TranscriptStoreError =
	| { kind: "unavailable"; failure: StorageFailure }
	| { kind: "storage"; failure: StorageFailure }
	| { kind: "conflict"; id: string; field: string }
	| { kind: "invalidTransition"; id: string; from: string; to: string }
	| { kind: "unknownBot"; id: string }
	/** Nothing was written and nothing on the bot changed: it still wears whatever it
	 * wore before the upload. */
	| { kind: "rejectedAvatarImage"; reason: AvatarRejection }
	/** The bot's plugin bundle could not be written, so the save was undone: the bot
	 * is as it was, brief included. A refusal rather than a warning because the bundle
	 * is what its process is started on — a save reported as done over a bundle that
	 * kept the old brief would leave the bot answering by it for good. */
	| { kind: "unwritableBundle"; detail: string }
