import type { AgentSidebarBot } from "@workspace/ui/components/agents/agent-sidebar"
import {
	BLOT_TINTS,
	type BotCommitItem,
	type BotModelOption,
	type BotSettingsValue,
	DEFAULT_BOT_OUTPUT_STYLE,
} from "@workspace/ui/components/bot-settings"

import type { BotCommit } from "./history-controller"
import { rosterTimestamp } from "./roster-timestamp"

import { avatarSrc } from "../host"
import type { SidebarActivity } from "../chat/screen-model"
import type {
	AvatarAnimal,
	AvatarBlot,
	Bot,
	BotIdentity,
} from "../conversations/store-contract"
import type { LastWord } from "../conversations/transcript-state"

/** What is offered when the catalogue is empty — a launch whose sidecar could not be
 * reached, or one whose sidecar names no model, or `bun dev:web`, which has no sidecar
 * to ask. The four tier aliases and nothing else: they are the labels Claude Code has
 * resolved for as long as it has had tiers, and an alias follows its tier rather than
 * pinning a bot to one release of it.
 *
 * It is a floor, not a vocabulary. What the agent really offers is read from the
 * sidecar — see [`readModelCatalogue`] — and a value outside either list is still a
 * value the store keeps. */
export const FALLBACK_MODELS = ["fable", "opus", "sonnet", "haiku"]

/** What a new bot is created on. An alias, so it follows its tier. */
const NEW_BOT_MODEL = "sonnet"

/** The built-in tools that write files and run commands, named the way the host
 * names them — `src-tauri/src/bundles.rs` holds the same four and reads them back
 * as "changes nothing". The switch in the panel is these four names in the bot's
 * denials and nothing else, which is what keeps one list the only author of the
 * denial the agent file carries. */
export const CHANGING_TOOLS = ["Bash", "Edit", "NotebookEdit", "Write"]

/** The denials a bot carries once the switch has been moved. A switch standing
 * where the bot's own denials put it moves nothing: the list is what the reader
 * edits tool by tool, and a save that read the switch back over it would take away
 * a tool they denied by hand. Thrown on it adds the four to whatever is already
 * denied; thrown off it takes those four out and leaves every other denial
 * standing. */
const withChangesNothing = (bot: Bot, changesNothing: boolean): string[] => {
	if (changesNothing === bot.changesNothing) {
		return bot.deniedTools
	}
	return changesNothing
		? [
				...bot.deniedTools,
				...CHANGING_TOOLS.filter((tool) => !bot.deniedTools.includes(tool)),
			]
		: bot.deniedTools.filter((tool) => !CHANGING_TOOLS.includes(tool))
}

/** The same reading the host answers `changesNothing` with, made here for a value
 * the store has not been told about yet. */
export const deniesChanges = (denied: string[]): boolean =>
	CHANGING_TOOLS.every((tool) => denied.includes(tool))

/** The options for one bot: what the sidecar names, or the fallback when it names
 * nothing, plus the label the bot already holds when that is in neither. Offering a
 * bot's own value back is what keeps the select from showing an empty box over a value
 * the file holds, and what keeps an edit to some other field from quietly moving the
 * bot to a model somebody else chose.
 *
 * Every label is its value, verbatim. These are the words Claude Code accepts — a
 * tier alias, a long-context variant, a dated identifier — and dressing them up would
 * be inventing a vocabulary on top of the one the sidecar declares. */
export const modelOptionsFor = (
	model: string,
	catalogue: string[],
): BotModelOption[] => {
	const offered = catalogue.length > 0 ? catalogue : FALLBACK_MODELS
	const values = offered.includes(model) ? offered : [...offered, model]
	return values.map((value) => ({ label: value, value }))
}

/** The faces the app hands out, in the order the picker shows them. The list is
 * spelled here because giving a new bot a face is this side's decision — the host
 * seeds none — and it satisfies the store's vocabulary, so a face it would refuse
 * does not compile. */
const FACES = [
	"rabbit",
	"cat",
	"bear",
	"chick",
	"dog",
	"mouse",
	"owl",
	"koala",
] as const satisfies readonly AvatarAnimal[]

/** The names a new bot is called one of. Spelled here for the reason the faces are:
 * naming a bot is this side's decision — the host names none — and a reader who
 * wanted another word renames it in the panel that opens on it. Short and fond, so a
 * row reads as somebody rather than as a slot. */
export const BOT_NAMES = [
	"Bean",
	"Biscuit",
	"Bramble",
	"Bubble",
	"Buttons",
	"Clover",
	"Cricket",
	"Dimple",
	"Doodle",
	"Ember",
	"Fern",
	"Fig",
	"Fizz",
	"Gizmo",
	"Honey",
	"Jelly",
	"Kiwi",
	"Mango",
	"Marble",
	"Mittens",
	"Mochi",
	"Muffin",
	"Nimbus",
	"Noodle",
	"Nugget",
	"Olive",
	"Peanut",
	"Pebble",
	"Pickle",
	"Pip",
	"Plum",
	"Poppy",
	"Sprout",
	"Toast",
	"Twig",
	"Waffle",
] as const

/** A face no bot in the roster is wearing, so a reader who creates three bots gets
 * three of them. Once all eight are taken the list starts over, which is the
 * honest answer for a roster larger than the faces there are. */
const nextFace = (bots: Bot[]): AvatarAnimal => {
	const worn = new Set(bots.map((bot) => bot.avatarAnimal))
	return (
		FACES.find((face) => !worn.has(face)) ?? FACES[bots.length % FACES.length]
	)
}

/** A tint no bot in the roster is marked with, so a reader who creates three bots
 * gets three of them and tells the rows apart before reading a name. Once all eight
 * are taken the list starts over, the same answer [`nextFace`] gives a roster larger
 * than the faces there are.
 *
 * A new bot is always marked: the picker keeps its "no mark" for a reader who wants
 * the animal on its own, and the absence is what a bot from before this was drawn
 * still carries. */
const nextBlot = (bots: Bot[]): AvatarBlot => {
	const marked = new Set(bots.map((bot) => bot.avatarBlot))
	return (
		BLOT_TINTS.find((tint) => !marked.has(tint)) ??
		BLOT_TINTS[bots.length % BLOT_TINTS.length]
	)
}

/** A name no bot in the roster carries, drawn rather than taken in order, so a
 * roster reads as a litter rather than as the list in the order it is written. Once
 * every name is carried the whole list is in play again, which is the honest answer
 * for a roster larger than the names there are. */
const nextName = (bots: Bot[]): string => {
	const carried = new Set(bots.map((bot) => bot.name))
	const free = BOT_NAMES.filter((name) => !carried.has(name))
	const pool = free.length > 0 ? free : BOT_NAMES
	return pool[Math.floor(Math.random() * pool.length)]
}

/** Everything a bot is created with. Nothing here is asked of the reader first —
 * the bot exists, and the panel that opens on it is where it is described — so
 * every field is either the honest empty or a choice the app makes on their
 * behalf. */
export const newBotIdentity = (bots: Bot[]): BotIdentity => ({
	name: nextName(bots),
	title: "",
	model: NEW_BOT_MODEL,
	avatarAnimal: nextFace(bots),
	avatarBlot: nextBlot(bots),
	avatarImagePath: null,
	workingDir: null,
	instructions: "",
	deniedTools: [],
	outputStyle: DEFAULT_BOT_OUTPUT_STYLE,
})

/** The stored bot as the settings panel edits it. */
export const toSettingsValue = (bot: Bot): BotSettingsValue => ({
	identity: {
		animal: bot.avatarAnimal,
		blot: bot.avatarBlot ?? undefined,
		image: avatarSrc(bot.avatarImagePath),
	},
	name: bot.name,
	title: bot.title,
	instructions: bot.instructions,
	model: bot.model,
	workingDirectory: bot.workingDir ?? "",
	changesNothing: bot.changesNothing,
})

/** A write to the bundle as the History tab lists it. Seconds are what a commit
 * holds and milliseconds are what the panel reads, which is the whole of the
 * mapping past the diff travelling as it came. */
export const toCommitItem = (commit: BotCommit): BotCommitItem => ({
	id: commit.id,
	at: commit.timestamp * 1000,
	author: commit.author,
	title: commit.title,
	body: commit.body,
	diff: commit.diff,
})

/** The panel's value as the store is told it, resolved against the bot it stands
 * for.
 *
 * The picture is the one field a caller may not invent: the panel holds the URL it
 * was handed to render, and the store holds the path that URL was built from. So a
 * value that still carries an image keeps the path the bot already wears, and one
 * that carries none takes the picture off — which is what choosing an animal in the
 * picker does, since it emits an identity with no image at all.
 *
 * The style is carried over for a plainer reason: the panel edits it beside its
 * value rather than in it, so no write the panel's value authors moves the bot off
 * the style it already answers under. */
export const toIdentity = (value: BotSettingsValue, bot: Bot): BotIdentity => ({
	name: value.name,
	title: value.title,
	model: value.model,
	avatarAnimal: value.identity.animal,
	avatarBlot: value.identity.blot ?? null,
	avatarImagePath: value.identity.image ? bot.avatarImagePath : null,
	workingDir: value.workingDirectory.trim() || null,
	instructions: value.instructions,
	deniedTools: withChangesNothing(bot, value.changesNothing),
	outputStyle: bot.outputStyle,
})

/** The denials as one word, so two lists holding the same names in another order
 * are the same denial. What the file carries is a set — the host sorts it before it
 * writes the key — and a reader who ticked the same tools twice has changed
 * nothing. */
const denialOf = (denied: string[]): string => [...denied].sort().join(",")

/** Whether this value would start a process differently from the one already
 * answering for the bot. Four fields do: the instructions a child is given as its
 * system prompt, the directory it is started in, the model it answers under, and
 * the tools it is denied — the last two are keys of the agent file the child is
 * promoted to, so both are read once, when that child starts. All four are settled
 * at spawn, so a bot that changes any of them is a bot whose live runtime has to be
 * replaced — everything else about it is read where it is shown, or travels with
 * the next prompt. The style a bot writes in settles at spawn too, but it is not
 * asked about here: the panel edits it beside its value rather than in it, so the
 * pick is what retires the runtime. */
export const changesRuntime = (bot: Bot, value: BotSettingsValue): boolean => {
	const next = toIdentity(value, bot)
	return (
		next.instructions !== bot.instructions ||
		next.workingDir !== bot.workingDir ||
		next.model !== bot.model ||
		denialOf(next.deniedTools) !== denialOf(bot.deniedTools)
	)
}

/** What the chat knows about the bots it lists, both halves of it read per bot.
 * Every bot runs a process of its own, so what is working is read per row rather
 * than granted to the open one: the reader who walks away from a bot that is
 * answering is owed the sight of it still answering. Every bot holds a conversation
 * of its own for the same reason, so every row previews its own last word. */
export type RosterActivity = {
	working: Record<string, SidebarActivity>
	previews: Record<string, LastWord | undefined>
}

/** The roster as the sidebar reads it: every bot from the database, and the live
 * half of each. An empty title is left out rather than passed through — the row
 * draws no badge for a bot nobody gave a role.
 *
 * `now` is the clock the whole array is labelled from: one reading for every row,
 * so two rows a minute apart cannot be read against two different nows. A bot
 * nothing has been said to yet carries neither a preview nor a time — the slots keep
 * their place empty. */
export const toRosterBots = (
	bots: Bot[],
	activity: RosterActivity,
	now: number,
): AgentSidebarBot[] =>
	bots.map((bot) => {
		const working = activity.working[bot.id]
		const preview = activity.previews[bot.id]
		return {
			id: bot.id,
			name: bot.name,
			title: bot.title || undefined,
			animal: bot.avatarAnimal,
			blot: bot.avatarBlot ?? undefined,
			image: avatarSrc(bot.avatarImagePath),
			lastMessage: preview?.text,
			timestamp: preview ? rosterTimestamp(preview.at, now) : undefined,
			status: working?.isWorking ? "working" : "idle",
			pose: working?.kind,
		}
	})
