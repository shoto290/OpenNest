/** Every string a reader sees on the chat surface — transcript, composer, tool
 * cards and markdown — plus the two the host hands down as props. */
const chat = {
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
	connection: {
		checking: "Checking Claude Code…",
		ready: "Claude Code ready",
		unavailable: "Claude Code unavailable",
		crashed: "Claude Code stopped",
	},
	transcript: {
		label: "Conversation",
		loadOlder: "Load older messages",
		startOfHistory: "Beginning of the conversation",
		message: {
			user: "user message",
			assistant: "assistant message",
		},
		typing: "Responding",
		showMore: "Show more",
		showLess: "Show less",
	},
	turn: {
		copy: "Copy",
		copied: "Copied",
		retry: "Retry",
		footer: {
			cancelled: "Stopped",
			failed: "This response failed",
		},
	},
	working: {
		name: "No name",
		verb: {
			thinking: "thinking",
			searching: "searching",
			working: "working",
			writing: "writing",
			waiting: "waiting for you",
		},
		state: "{{name}} is {{verb}}…",
		labelled: "{{name}} · {{label}}",
	},
	notice: {
		retry: "Retry",
		exhausted: "Retry limit reached after {{attempts}} attempts",
		dismiss: "Dismiss notice",
	},
	attachments: {
		label: "Attachments",
		open: "Open {{name}}",
		remove: "Remove {{name}}",
		attach: "Attach files",
	},
	composer: {
		label: "Prompt",
		placeholder: "Ask the agent to do something…",
		send: "Send prompt",
		stop: "Stop generating",
		commands: "Commands",
	},
	toolApproval: {
		title: "Allow this tool to run?",
		status: {
			pending: "Approval required",
			allowed: "Allowed once",
			denied: "Denied",
		},
		sensitive: "Hidden",
		input: "Tool input",
		allowOnce: "Allow once",
		deny: "Deny",
	},
	toolResult: {
		status: {
			running: "Running",
			success: "Completed",
			error: "Failed",
			cancelled: "Cancelled",
		},
		output: "{{status}} output",
		copy: "Copy result",
		copied: "Copied",
		retry: "Run again",
	},
	response: {
		copy: "Copy response",
		copied: "Copied",
		retry: "Retry response",
		helpful: "Helpful",
		notHelpful: "Not helpful",
	},
	code: {
		snippet: "Code snippet",
		namedSnippet: "Code snippet, {{name}}",
		copy: "Copy code",
		copied: "Copied",
		copyTooltip: "Copy",
		copyAnnounced: "Code copied to clipboard",
		copyFailed: "Copying the code failed",
		writing: "Writing",
		ready: "Ready",
	},
	table: {
		label: "Table",
		copy: "Copy table",
		copyAnnounced: "Table copied to clipboard",
	},
	diagram: {
		label: "Diagram",
	},
	task: {
		done: "Done",
		todo: "To do",
	},
	screen: {
		label: "Claude Code conversation",
		settings: "Bot settings",
		placeholder: "Ask {{name}} to do something…",
		waiting: "Waiting for Claude Code…",
		permission: {
			description: "Claude Code is waiting on you before it runs this tool.",
			path: "Path",
		},
		attachmentsRefused: "Files not attached",
		restart: "Restart session",
		notice: {
			crashed: "Claude Code stopped",
			resumeFailed: "Previous conversation could not be resumed",
			workingDirectoryRefused: "The bot's folder was not found",
			unavailable: "Claude Code is unavailable",
			failed: "That request did not go through",
		},
		transport: {
			binaryNotFound:
				"Claude Code was not found. Locations tried: {{searched}}",
			notAuthenticated:
				"Claude Code is not signed in. Run `claude auth login`.",
			authCheckFailed: "The sign-in check failed: {{detail}}",
			spawnFailed: "Claude Code could not be started: {{detail}}",
			startupTimeout: "Claude Code did not answer within {{timeoutMs}} ms.",
			crashed: "Claude Code exited (code {{code}}).",
			crashedUnknownCode: "Claude Code exited (code unknown).",
			resumeFailed:
				"That conversation could not be resumed. Claude Code started a new one; your messages are still here.",
			workingDirectoryRefused:
				"{{path}} is not there any more. This bot is answering from the usual place instead.",
			invalidFrame: "An unreadable frame was skipped: {{detail}}",
			notStarted: "No session is running.",
			turnAlreadyRunning: "A turn is already running.",
			transitionInProgress: "A session change is already in progress.",
			noActiveTurn: "There is no turn to interrupt.",
			staleRuntimeSession:
				"That session has been replaced. The one running now took its place.",
			unknownPermission: "Unknown permission request ({{id}}).",
			writeFailed: "The prompt could not be sent: {{detail}}",
		},
		attachment: {
			megabytes: "{{size}} MB",
			storage: "The files could not be written down ({{failure}}).",
			unknownConversation:
				"This conversation is not on the record any more. Reopen the bot and attach them again.",
			tooMany:
				"A prompt carries {{limit}} files at most, and {{staged}} are staged.",
			tooLarge: "{{name}} is over the {{limit}} a single file may weigh.",
			tooLargeTogether:
				"The staged files come to {{bytes}}, over the {{limit}} one prompt may carry.",
			unwritable: "The files could not be written down: {{detail}}",
		},
	},
} as const

export { chat }
