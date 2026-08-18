import { convertFileSrc } from "@tauri-apps/api/core"

import type { AgentSidebarBot } from "@workspace/ui/components/agents/agent-sidebar"
import type {
	BotModelOption,
	BotSettingsValue,
} from "@workspace/ui/components/bot-settings-panel"
import type { BotWorkingKind } from "@workspace/ui/components/bot-working"

import { isDesktopHost } from "../host"
import type {
	AvatarAnimal,
	Bot,
	BotIdentity,
} from "../conversations/store-contract"

/** The aliases the settings offer, largest tier first. Aliases rather than versioned
 * names on purpose: Claude Code resolves one to the latest model of its tier, so a
 * bot left on `sonnet` follows the tier instead of being pinned to whatever was
 * current the day it was created.
 *
 * A hardcoded list because there is nothing to read one from: there is no
 * `claude models`, the init frame of a session names only the model already
 * answering, and parsing `--help` would make the product's vocabulary a side effect
 * of somebody's usage text. So this is the list the product stands behind, and
 * anything outside it is still a value the store keeps — see [`modelOptionsFor`]. */
export const MODEL_ALIASES: BotModelOption[] = [
	{ label: "Claude Fable", value: "fable" },
	{ label: "Claude Opus", value: "opus" },
	{ label: "Claude Sonnet", value: "sonnet" },
	{ label: "Claude Haiku", value: "haiku" },
]

/** What a new bot is created on. An alias, so it follows its tier. */
const NEW_BOT_MODEL = "sonnet"

/** The options for one bot: the aliases, plus the label it already carries when that
 * is not one of them. A bot on a versioned name, or on an alias this build has not
 * heard of yet, is a bot whose model the reader has to be able to see — offering it
 * back is what keeps the select from showing an empty box over a value the file
 * holds, and what keeps a rename of some other field from quietly moving the bot to
 * a model somebody else chose. */
export const modelOptionsFor = (model: string): BotModelOption[] =>
	MODEL_ALIASES.some((alias) => alias.value === model)
		? MODEL_ALIASES
		: [...MODEL_ALIASES, { label: model, value: model }]

/** The faces the app hands out, in the order the picker shows them. The list is
 * spelled here because giving a new bot a face is this side's decision — the host
 * seeds none — and it satisfies the store's vocabulary, so a face it would refuse
 * does not compile. */
const FACES = [
	"cat",
	"rabbit",
	"bear",
	"chick",
	"dog",
	"mouse",
	"owl",
	"koala",
] as const satisfies readonly AvatarAnimal[]

/** What a bot is called before it is named. The panel opens on it, so it is copy a
 * reader replaces rather than a placeholder they have to fill in to see a row. */
const NEW_BOT_NAME = "New bot"

/** The one way a stored path becomes something the webview may load: the asset
 * protocol, scoped by the host to the single directory avatars live in. A bot with
 * no picture has no source at all, which is what leaves it wearing its animal.
 *
 * Outside the host there is no protocol to convert to — `convertFileSrc` reaches
 * for internals only a Tauri window injects — so `bun dev:web` is handed the path
 * the fake store answered, unconverted. */
export const avatarSrc = (path: string | null): string | undefined => {
	if (!path) {
		return undefined
	}
	return isDesktopHost() ? convertFileSrc(path) : path
}

/** A face no bot in the roster is wearing, so a reader who creates three bots gets
 * three of them. Once all eight are taken the list starts over, which is the
 * honest answer for a roster larger than the faces there are. */
const nextFace = (bots: Bot[]): AvatarAnimal => {
	const worn = new Set(bots.map((bot) => bot.avatarAnimal))
	return (
		FACES.find((face) => !worn.has(face)) ?? FACES[bots.length % FACES.length]
	)
}

/** Everything a bot is created with. Nothing here is asked of the reader first —
 * the bot exists, and the panel that opens on it is where it is described — so
 * every field is either the honest empty or a choice the app makes on their
 * behalf. */
export const newBotIdentity = (bots: Bot[]): BotIdentity => ({
	name: NEW_BOT_NAME,
	title: "",
	description: "",
	model: NEW_BOT_MODEL,
	avatarAnimal: nextFace(bots),
	avatarPose: "idle",
	avatarImagePath: null,
	workingDir: null,
	instructions: "",
})

/** The stored bot as the settings panel edits it. */
export const toSettingsValue = (bot: Bot): BotSettingsValue => ({
	identity: {
		animal: bot.avatarAnimal,
		pose: bot.avatarPose,
		image: avatarSrc(bot.avatarImagePath),
	},
	name: bot.name,
	title: bot.title,
	description: bot.description,
	instructions: bot.instructions,
	model: bot.model,
	workingDirectory: bot.workingDir ?? "",
})

/** The panel's value as the store is told it, resolved against the bot it stands
 * for.
 *
 * The picture is the one field a caller may not invent: the panel holds the URL it
 * was handed to render, and the store holds the path that URL was built from. So a
 * value that still carries an image keeps the path the bot already wears, and one
 * that carries none takes the picture off — which is what choosing an animal in the
 * picker does, since it emits an identity with no image at all. */
export const toIdentity = (value: BotSettingsValue, bot: Bot): BotIdentity => ({
	name: value.name,
	title: value.title,
	description: value.description,
	model: value.model,
	avatarAnimal: value.identity.animal,
	avatarPose: value.identity.pose,
	avatarImagePath: value.identity.image ? bot.avatarImagePath : null,
	workingDir: value.workingDirectory.trim() || null,
	instructions: value.instructions,
})

/** What the chat knows about the bot it is open on. This build runs one process, so
 * it is the selected bot's row and only its row that ever reads as working. */
export type RosterActivity = {
	selectedBotId: string | null
	isWorking: boolean
	kind?: BotWorkingKind
	lastMessage?: string
}

/** The roster as the sidebar reads it: every bot from the database, and the live
 * half over the one the chat is open on. An empty title is left out rather than
 * passed through — the row draws no badge for a bot nobody gave a role. */
export const toRosterBots = (
	bots: Bot[],
	activity: RosterActivity,
): AgentSidebarBot[] =>
	bots.map((bot) => {
		const isOpen = bot.id === activity.selectedBotId
		return {
			id: bot.id,
			name: bot.name,
			title: bot.title || undefined,
			animal: bot.avatarAnimal,
			identity: bot.avatarPose,
			image: avatarSrc(bot.avatarImagePath),
			lastMessage: isOpen ? activity.lastMessage : undefined,
			status: isOpen && activity.isWorking ? "working" : "idle",
			pose: isOpen ? activity.kind : undefined,
		}
	})
