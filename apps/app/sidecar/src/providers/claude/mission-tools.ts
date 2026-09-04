import { type SdkMcpToolDefinition, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { carriedTo } from "./host-calls"

const SUBTYPE = "mission"

const OBJECTIVE =
	"What this mission delivers, in one sentence, written as an order to yourself."

const TICKET_PLATFORM =
	"Where the ticket lives, such as linear, github or jira."

const TICKET_EXTERNAL_ID = "The id the ticket carries on its own platform."

const TICKET_URL = "The address the person opens to read the ticket."

const TICKET_TITLE = "The title the ticket carries on its own platform."

const TOOLS = "The tools this mission is allowed to run with."

const MISSION_ID = "The id mission_open answered."

const LINE =
	"One line of progress, written for the person who reads the thread."

const QUESTION =
	"The one question the person has to answer for you to carry on."

const REASON = "Why you cannot decide it yourself."

const OUTCOME =
	"done when the objective is met, failed when it is out of reach."

const SUMMARY = "What came out of the mission, in a few lines."

const OPEN =
	"Open a mission on this conversation, owned by you, and get its own thread. Call this once you and the person agree on the objective and the ticket it carries."

const NOTE =
	"Record one line of progress on a mission of yours. Write what moved, not what you are about to do."

const ESCALATE =
	"Hand a mission back to the person with the one question that blocks you. The mission waits until they answer."

const CLOSE =
	"Close a mission of yours with its outcome and a summary. Nothing can be appended to it afterwards."

const TICKET = z.object({
	platform: z.string().describe(TICKET_PLATFORM),
	externalId: z.string().describe(TICKET_EXTERNAL_ID),
	url: z.string().describe(TICKET_URL),
	title: z.string().describe(TICKET_TITLE),
})

type ToolInput = Record<string, z.ZodType>

const NAMED: ToolInput = { id: z.string().describe(MISSION_ID) }

const OPENED: ToolInput = {
	objective: z.string().describe(OBJECTIVE),
	ticket: TICKET,
	tools: z.array(z.string()).describe(TOOLS),
}

const NOTED: ToolInput = { ...NAMED, line: z.string().describe(LINE) }

const ESCALATED: ToolInput = {
	...NAMED,
	question: z.string().describe(QUESTION),
	reason: z.string().describe(REASON),
}

const CLOSED: ToolInput = {
	...NAMED,
	outcome: z.enum(["done", "failed"]).describe(OUTCOME),
	summary: z.string().describe(SUMMARY),
}

const asked = carriedTo(SUBTYPE)

type MissionTool = SdkMcpToolDefinition<ToolInput>

export const missionTools = (session: string | undefined): MissionTool[] => [
	tool("mission_open", OPEN, OPENED, (input) => asked(session, "open", input)),
	tool("mission_note", NOTE, NOTED, (input) => asked(session, "note", input)),
	tool("mission_escalate", ESCALATE, ESCALATED, (input) =>
		asked(session, "escalate", input),
	),
	tool("mission_close", CLOSE, CLOSED, (input) =>
		asked(session, "close", input),
	),
]
