import { createHighlighterCoreSync, type HighlighterCore } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"
import bash from "shiki/langs/bash.mjs"
import css from "shiki/langs/css.mjs"
import diff from "shiki/langs/diff.mjs"
import html from "shiki/langs/html.mjs"
import json from "shiki/langs/json.mjs"
import markdown from "shiki/langs/markdown.mjs"
import python from "shiki/langs/python.mjs"
import rust from "shiki/langs/rust.mjs"
import tsx from "shiki/langs/tsx.mjs"
import typescript from "shiki/langs/typescript.mjs"
import yaml from "shiki/langs/yaml.mjs"
import darkTheme from "shiki/themes/github-dark-high-contrast.mjs"
import lightTheme from "shiki/themes/github-light-high-contrast.mjs"

export const CODE_LANGUAGES = [
	"bash",
	"css",
	"diff",
	"html",
	"json",
	"markdown",
	"python",
	"rust",
	"text",
	"tsx",
	"typescript",
	"yaml",
] as const

export type CodeLanguage = (typeof CODE_LANGUAGES)[number]

export interface CodeToken {
	content: string
	offset: number
	light?: string
	dark?: string
}

export type CodeTokenLines = CodeToken[][]

export interface CodeSourceLine {
	content: string
	offset: number
	tokens?: CodeToken[]
}

const LIGHT_THEME = "github-light-high-contrast"
const DARK_THEME = "github-dark-high-contrast"
const TOKEN_CACHE_LIMIT = 256

const WARM_SAMPLE = '# "warm" <b>1</b>\nconst a = { b: "c" } // d\n- e: 2\n'

const LANGUAGE_ALIASES: Record<string, CodeLanguage> = {
	console: "bash",
	javascript: "typescript",
	js: "typescript",
	jsonc: "json",
	jsx: "tsx",
	md: "markdown",
	mjs: "typescript",
	patch: "diff",
	plain: "text",
	plaintext: "text",
	py: "python",
	rs: "rust",
	sh: "bash",
	shell: "bash",
	ts: "typescript",
	txt: "text",
	yml: "yaml",
	zsh: "bash",
}

const isCodeLanguage = (value: string): value is CodeLanguage =>
	CODE_LANGUAGES.includes(value as CodeLanguage)

export function resolveCodeLanguage(language?: string): CodeLanguage {
	const requested = language?.trim().toLowerCase() ?? ""
	if (isCodeLanguage(requested)) return requested
	return LANGUAGE_ALIASES[requested] ?? "text"
}

let highlighter: HighlighterCore | null = null
let highlighterBuilds = 0

const warmedLanguages = new Set<CodeLanguage>()

const readyWatchers = new Set<() => void>()

function getHighlighter() {
	if (!highlighter) {
		highlighterBuilds += 1
		highlighter = createHighlighterCoreSync({
			engine: createJavaScriptRegexEngine({ forgiving: true }),
			themes: [lightTheme, darkTheme],
			langs: [
				bash,
				css,
				diff,
				html,
				json,
				markdown,
				python,
				rust,
				tsx,
				typescript,
				yaml,
			],
		})
	}
	return highlighter
}

function tokenize(code: string, language: CodeLanguage): CodeTokenLines {
	return getHighlighter()
		.codeToTokensWithThemes(code, {
			lang: language,
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
}

export function warmCodeLanguage(language?: string) {
	const resolved = resolveCodeLanguage(language)
	if (warmedLanguages.has(resolved)) return

	tokenize(WARM_SAMPLE, resolved)
	warmedLanguages.add(resolved)
	for (const notify of readyWatchers) notify()
}

export function prepareHighlighter() {
	for (const language of CODE_LANGUAGES) warmCodeLanguage(language)
}

export function isCodeLanguageWarm(language?: string) {
	return warmedLanguages.has(resolveCodeLanguage(language))
}

export function highlighterBuildCount() {
	return highlighterBuilds
}

export function subscribeToCodeHighlighter(watcher: () => void) {
	readyWatchers.add(watcher)
	return () => {
		readyWatchers.delete(watcher)
	}
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

export function highlightCode(code: string, language?: string): CodeTokenLines {
	const resolved = resolveCodeLanguage(language)
	const key = `${resolved}:${code}`
	const cached = tokenCache.get(key)
	if (cached) return cached

	return remember(key, tokenize(code, resolved))
}

export function toCodeLines(
	code: string,
	tokens?: CodeTokenLines,
): CodeSourceLine[] {
	let offset = 0
	return code.split("\n").map((content, index) => {
		const line = { content, offset, tokens: tokens?.[index] }
		offset += content.length + 1
		return line
	})
}
