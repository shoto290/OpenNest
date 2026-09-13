import { type SdkMcpToolDefinition, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { carriedTo } from "./host-calls"

const SUBTYPE = "companion"

const NAME =
	"The name the person will call this companion by, theirs or the one they picked."

const JOB =
	"What this companion is for, in a few words, read under its name on its roster line."

const DESCRIPTION =
	"What this companion does and how it works, written as an order to it."

const SUGGESTIONS =
	"Read the companions this app suggests, each with the name, the job, the description and the blurb it ships, before you ask the person which one they want."

const CREATE =
	"Create a companion in the space of this conversation, once the person has picked a suggestion or agreed on the name, the job and the description you read back to them."

const FIRST_RUN_DONE =
	"Record the first run of the app as finished, once the person has answered the hand-off question, so the app stops opening on it."

type ToolInput = Record<string, z.ZodType>

const NOTHING: ToolInput = {}

const DRAFTED: ToolInput = {
	name: z.string().describe(NAME),
	job: z.string().describe(JOB),
	description: z.string().describe(DESCRIPTION),
}

const asked = carriedTo(SUBTYPE)

type CompanionTool = SdkMcpToolDefinition<ToolInput>

export const companionTools = (
	session: string | undefined,
): CompanionTool[] => [
	tool("companion_suggestions", SUGGESTIONS, NOTHING, () =>
		asked(session, "suggestions", {}),
	),
	tool("companion_create", CREATE, DRAFTED, (input) =>
		asked(session, "create", input),
	),
	tool("companion_first_run_done", FIRST_RUN_DONE, NOTHING, () =>
		asked(session, "firstRunDone", {}),
	),
]
