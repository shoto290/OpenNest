import { tmpdir } from "node:os"

import { query } from "@anthropic-ai/claude-agent-sdk"

import { resolveExecutable } from "./executable"
import { createPromptStream } from "./prompt-stream"

const TITLE_LIMIT = 60

const INSTRUCTIONS = [
	"Write a title for the text below.",
	"Answer with the title alone, on a single line, at most sixty characters.",
	"Write it in the language of the text.",
	"No quotes, no trailing punctuation, no explanation.",
].join(" ")

export const shortTitle = (answer: string): string | null => {
	const line = answer
		.split("\n")
		.map((candidate) => candidate.trim())
		.find((candidate) => candidate.length > 0)
	return line?.slice(0, TITLE_LIMIT).trim() || null
}

const asked = (text: string) => `${INSTRUCTIONS}\n\n${text}`

export const claudeTitle = async (text: string): Promise<string | null> => {
	if (!text.trim()) {
		return null
	}
	const prompts = createPromptStream()
	const run = query({
		prompt: prompts.stream,
		options: {
			cwd: tmpdir(),
			allowedTools: [],
			settingSources: [],
			persistSession: false,
			pathToClaudeCodeExecutable: resolveExecutable(),
			stderr: () => {},
		},
	})
	try {
		prompts.push(asked(text))
		for await (const message of run) {
			if (message.type === "result") {
				return message.subtype === "success" ? shortTitle(message.result) : null
			}
		}
		return null
	} finally {
		prompts.end()
		run.close()
	}
}
