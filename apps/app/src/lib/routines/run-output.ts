export type RunReport =
	| { outcome: "report"; text: string }
	| { outcome: "nothing" }

export const RUN_OUTPUT_SCHEMA: Record<string, unknown> = {
	type: "object",
	properties: {
		outcome: {
			type: "string",
			enum: ["report", "nothing"],
			description:
				"report when the routine has something to say, nothing when it has not",
		},
		report: {
			type: "string",
			description: "the report text, empty when the outcome is nothing",
		},
	},
	required: ["outcome", "report"],
	additionalProperties: false,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null

export const readRunReport = (structuredOutput: unknown): RunReport | null => {
	if (!isRecord(structuredOutput)) {
		return null
	}
	const { outcome, report } = structuredOutput
	if (outcome === "nothing") {
		return { outcome: "nothing" }
	}
	if (outcome !== "report" || typeof report !== "string") {
		return null
	}
	const text = report.trim()
	return text.length > 0 ? { outcome: "report", text } : null
}
