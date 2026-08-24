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

export const FALLBACK_MODELS = ["fable", "opus", "sonnet", "haiku"]

const NEW_BOT_MODEL = "sonnet"

export const CHANGING_TOOLS = ["Bash", "Edit", "NotebookEdit", "Write"]

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

export const deniesChanges = (denied: string[]): boolean =>
	CHANGING_TOOLS.every((tool) => denied.includes(tool))

export const modelOptionsFor = (
	model: string,
	catalogue: string[],
): BotModelOption[] => {
	const offered = catalogue.length > 0 ? catalogue : FALLBACK_MODELS
	const values = offered.includes(model) ? offered : [...offered, model]
	return values.map((value) => ({ label: value, value }))
}

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

const nextFace = (bots: Bot[]): AvatarAnimal => {
	const worn = new Set(bots.map((bot) => bot.avatarAnimal))
	return (
		FACES.find((face) => !worn.has(face)) ?? FACES[bots.length % FACES.length]
	)
}

const nextBlot = (bots: Bot[]): AvatarBlot => {
	const marked = new Set(bots.map((bot) => bot.avatarBlot))
	return (
		BLOT_TINTS.find((tint) => !marked.has(tint)) ??
		BLOT_TINTS[bots.length % BLOT_TINTS.length]
	)
}

const nextName = (bots: Bot[]): string => {
	const carried = new Set(bots.map((bot) => bot.name))
	const free = BOT_NAMES.filter((name) => !carried.has(name))
	const pool = free.length > 0 ? free : BOT_NAMES
	return pool[Math.floor(Math.random() * pool.length)]
}

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

export const toCommitItem = (commit: BotCommit): BotCommitItem => ({
	id: commit.id,
	at: commit.timestamp * 1000,
	author: commit.author,
	title: commit.title,
	body: commit.body,
	diff: commit.diff,
})

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

const denialOf = (denied: string[]): string => [...denied].sort().join(",")

export const changesRuntime = (bot: Bot, value: BotSettingsValue): boolean => {
	const next = toIdentity(value, bot)
	return (
		next.instructions !== bot.instructions ||
		next.workingDir !== bot.workingDir ||
		next.model !== bot.model ||
		denialOf(next.deniedTools) !== denialOf(bot.deniedTools)
	)
}

export type RosterActivity = {
	working: Record<string, SidebarActivity>
	previews: Record<string, LastWord | undefined>
}

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
