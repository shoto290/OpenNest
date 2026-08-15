import { createHighlighterCoreSync, type HighlighterCore } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"
import bash from "shiki/langs/bash.mjs"
import diff from "shiki/langs/diff.mjs"
import json from "shiki/langs/json.mjs"
import tsx from "shiki/langs/tsx.mjs"
import typescript from "shiki/langs/typescript.mjs"
import darkTheme from "shiki/themes/github-dark-high-contrast.mjs"
import lightTheme from "shiki/themes/github-light-high-contrast.mjs"

export const CODE_LANGUAGES = [
	"bash",
	"diff",
	"json",
	"text",
	"tsx",
	"typescript",
] as const

export type CodeLanguage = (typeof CODE_LANGUAGES)[number]

export interface CodeToken {
	content: string
	offset: number
	light?: string
	dark?: string
}

export type CodeTokenLines = CodeToken[][]

const LIGHT_THEME = "github-light-high-contrast"
const DARK_THEME = "github-dark-high-contrast"
const TOKEN_CACHE_LIMIT = 256

const LANGUAGE_ALIASES: Record<string, CodeLanguage> = {
	console: "bash",
	javascript: "typescript",
	js: "typescript",
	jsonc: "json",
	jsx: "tsx",
	mjs: "typescript",
	patch: "diff",
	plain: "text",
	plaintext: "text",
	sh: "bash",
	shell: "bash",
	ts: "typescript",
	txt: "text",
	zsh: "bash",
}

const isCodeLanguage = (value: string): value is CodeLanguage =>
	CODE_LANGUAGES.includes(value as CodeLanguage)

/** Anything unknown degrades to plain text rather than throwing on an unloaded grammar. */
export function resolveCodeLanguage(language?: string): CodeLanguage {
	const requested = language?.trim().toLowerCase() ?? ""
	if (isCodeLanguage(requested)) return requested
	return LANGUAGE_ALIASES[requested] ?? "text"
}

let highlighter: HighlighterCore | null = null

function getHighlighter() {
	if (!highlighter) {
		highlighter = createHighlighterCoreSync({
			engine: createJavaScriptRegexEngine({ forgiving: true }),
			themes: [lightTheme, darkTheme],
			langs: [bash, diff, json, tsx, typescript],
		})
	}
	return highlighter
}

const tokenCache = new Map<string, CodeTokenLines>()

function remember(key: string, lines: CodeTokenLines) {
	if (tokenCache.size >= TOKEN_CACHE_LIMIT) {
		const oldest = tokenCache.keys().next().value
		if (oldest !== undefined) tokenCache.delete(oldest)
	}
	tokenCache.set(key, lines)
	return lines
}

/** Synchronous by design: no grammar fetch, no WASM, identical output on every run. */
export function highlightCode(
	code: string,
	language?: string,
): CodeTokenLines {
	const resolved = resolveCodeLanguage(language)
	const key = `${resolved}:${code}`
	const cached = tokenCache.get(key)
	if (cached) return cached

	const lines = getHighlighter()
		.codeToTokensWithThemes(code, {
			lang: resolved,
			themes: { light: LIGHT_THEME, dark: DARK_THEME },
		})
		.map((line) =>
			line.map((token) => ({
				content: token.content,
				offset: token.offset,
				light: token.variants.light?.color,
				dark: token.variants.dark?.color,
			})),
		)

	return remember(key, lines)
}
