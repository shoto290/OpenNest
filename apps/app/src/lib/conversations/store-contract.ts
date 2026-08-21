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

/** The eight tints a bot may be marked with. `null` is a bot marked with none,
 * which is what a bot is until someone marks it — the host holds the same eight and
 * the same absence, so "no mark" never has to be spelled as a ninth word. */
export type AvatarBlot =
	| "coral"
	| "amber"
	| "moss"
	| "water"
	| "sky"
	| "lavender"
	| "rose"
	| "slate"

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
}

/** A bot as the host answers it: everything it was described with, plus the two
 * the host owns — the id it minted and the moment it wrote the row. */
export type Bot = BotIdentity & { id: string; createdAt: number }

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
export type BotSkill = {
	id: string
	name: string
	description: string
	body: string
	isPreloaded: boolean
}

/** What a skill is written with, whole — both to create one and to change one. The
 * mark is not here: it is set on its own, because it changes what the bot was told
 * rather than what the skill says. */
export type BotSkillDraft = {
	name: string
	description: string
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
