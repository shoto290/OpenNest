import { i18n } from "@workspace/ui/lib/i18n"

export type MentionBot = {
	id: string
	name: string
}

const MENTION_TOKEN = /<@([\w-]+)>/g

const MENTION_DRAFT = /(?:^|\s)@([^\s@]*)$/

const ARROBASE = "@"

const tokenOf = (botId: string) => `<@${botId}>`

const isNamedAt = (text: string, from: number, name: string) =>
	text.slice(from, from + name.length).toLocaleLowerCase() ===
	name.toLocaleLowerCase()

const botNamedAt = (text: string, from: number, bots: MentionBot[]) => {
	let found: MentionBot | null = null
	for (const bot of bots) {
		if (bot.name.length === 0 || !isNamedAt(text, from, bot.name)) {
			continue
		}
		if (!found || bot.name.length > found.name.length) {
			found = bot
		}
	}
	return found
}

const nameOf = (botId: string, bots: MentionBot[]) =>
	bots.find((bot) => bot.id === botId)?.name

export const toMentionTokens = (text: string, bots: MentionBot[]): string => {
	let written = ""
	let read = 0

	while (read < text.length) {
		const at = text.indexOf(ARROBASE, read)
		if (at < 0) {
			break
		}
		written += text.slice(read, at)
		const named = text[at - 1] === "<" ? null : botNamedAt(text, at + 1, bots)
		written += named ? tokenOf(named.id) : ARROBASE
		read = at + 1 + (named?.name.length ?? 0)
	}

	return written + text.slice(read)
}

export const toMentionNames = (text: string, bots: MentionBot[]): string =>
	text.replace(
		MENTION_TOKEN,
		(_, botId: string) =>
			`${ARROBASE}${nameOf(botId, bots) ?? i18n.t("chat:transcript.mention.unknown")}`,
	)

export const addresseesIn = (text: string, present: string[]): string[] => {
	const named: string[] = []
	for (const [, botId] of text.matchAll(MENTION_TOKEN)) {
		if (present.includes(botId) && !named.includes(botId)) {
			named.push(botId)
		}
	}
	return named
}

export const mentionQueryIn = (prompt: string): string | null => {
	const draft = MENTION_DRAFT.exec(prompt)
	return draft ? draft[1] : null
}

export const promptWithMention = (prompt: string, name: string): string => {
	const draft = MENTION_DRAFT.exec(prompt)
	if (!draft) {
		return prompt
	}
	const kept = prompt.slice(0, prompt.length - draft[1].length - 1)
	return `${kept}${ARROBASE}${name} `
}
