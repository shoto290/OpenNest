import type { MissionRunCause } from "./mission-run-prompt"

import { type RunReport, readRunReport } from "../routines/run-output"

const REPORTING_CAUSES: MissionRunCause[] = ["done", "failed"]

const isReportOwed = (cause: MissionRunCause) =>
	REPORTING_CAUSES.includes(cause)

const REPORT_OWED_SCHEMA: Record<string, unknown> = {
	type: "object",
	properties: {
		outcome: {
			type: "string",
			enum: ["report"],
			description: "report, the only outcome this mission run may end on",
		},
		report: {
			type: "string",
			description: "the report text of the mission run, never empty",
		},
	},
	required: ["outcome", "report"],
	additionalProperties: false,
}

const REPORT_FREE_SCHEMA: Record<string, unknown> = {
	type: "object",
	properties: {
		outcome: {
			type: "string",
			enum: ["report", "nothing"],
			description:
				"report when the mission run has something to say, nothing when it has not",
		},
		report: {
			type: "string",
			description:
				"the report text of the mission run, empty when the outcome is nothing",
		},
	},
	required: ["outcome", "report"],
	additionalProperties: false,
}

export const missionRunOutputSchemaFor = (
	cause: MissionRunCause,
): Record<string, unknown> =>
	isReportOwed(cause) ? REPORT_OWED_SCHEMA : REPORT_FREE_SCHEMA

export const readMissionRunReport = (
	cause: MissionRunCause,
	structuredOutput: unknown,
): RunReport | null => {
	const report = readRunReport(structuredOutput)

	if (report?.outcome === "nothing" && isReportOwed(cause)) {
		return null
	}

	return report
}
