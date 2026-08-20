/** The en catalogue, one namespace per surface. */
const en = {
	chat: {
		emptyState: {
			ready: {
				title: "Start with Claude Code",
				description:
					"OpenNest runs the Claude Code CLI installed on this machine. Nothing leaves your device.",
			},
			unavailable: {
				title: "Claude Code is not available",
				description:
					"OpenNest cannot reach the Claude Code CLI on this machine. Finish setup to start a conversation.",
			},
			settings: "Bot settings",
			hint: "Type your first prompt in the composer below",
			setup: "Set up Claude Code",
		},
	},
} as const

export { en }
