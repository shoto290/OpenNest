import {
	createSdkMcpServer,
	type Options,
	query,
	type SDKMessage,
	type Settings,
	tool,
} from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { resolveExecutable } from "./executable"
import { createPromptStream } from "./prompt-stream"

const TOOL_NAME = "delegate"

export const DELEGATE_SERVER = "opennest"

export const DELEGATE_TOOL = `mcp__${DELEGATE_SERVER}__${TOOL_NAME}`

const READ_ONLY_TOOLS = ["Read", "Glob", "Grep", "WebFetch", "WebSearch"]

const DESCRIPTION = [
	"Hand a self-contained job to a nested read-only agent and read its report right here.",
	"Use it to keep a wide search out of this conversation.",
	"The report comes back as the result of this call, in this same turn.",
].join(" ")

const INSTRUCTIONS = [
	"Everything the nested agent needs to do the job and report back.",
	"It shares this working directory but sees none of this conversation.",
].join(" ")

const ENDED = "the run ended before reporting"

const failed = (cause: string) => `The delegated run gave no report: ${cause}.`

type DelegateScope = {
	cwd: string
	managedSettings: Settings
}

export const reportOf = async (
	messages: AsyncIterable<SDKMessage>,
): Promise<string> => {
	for await (const message of messages) {
		if (message.type === "result") {
			return message.subtype === "success"
				? message.result
				: failed(message.subtype)
		}
	}
	return failed(ENDED)
}

const delegated = async (
	instructions: string,
	{ cwd, managedSettings }: DelegateScope,
): Promise<string> => {
	const prompts = createPromptStream()
	const run = query({
		prompt: prompts.stream,
		options: {
			cwd,
			tools: READ_ONLY_TOOLS,
			allowedTools: READ_ONLY_TOOLS,
			managedSettings,
			settingSources: [],
			persistSession: false,
			pathToClaudeCodeExecutable: resolveExecutable(),
			stderr: () => {},
		},
	})
	try {
		prompts.push(instructions)
		return await reportOf(run)
	} finally {
		prompts.end()
		run.close()
	}
}

export const delegateServer = (
	scope: DelegateScope,
): NonNullable<Options["mcpServers"]> => ({
	[DELEGATE_SERVER]: createSdkMcpServer({
		name: DELEGATE_SERVER,
		tools: [
			tool(
				TOOL_NAME,
				DESCRIPTION,
				{ instructions: z.string().describe(INSTRUCTIONS) },
				async ({ instructions }) => ({
					content: [
						{
							type: "text" as const,
							text: await delegated(instructions, scope),
						},
					],
				}),
			),
		],
	}),
})
