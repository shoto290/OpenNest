const chat = {
	emptyState: {
		ready: {
			title: "Start with Claude Code",
			description:
				"OpenNest talks to its built-in agent. Nothing leaves your device.",
		},
		unavailable: {
			title: "Claude Code is not available",
			description: "OpenNest cannot reach its built-in agent.",
		},
		settings: "Bot settings",
		hint: "Type your first prompt in the composer below",
		setup: "Try again",
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
		jumpToLatest: "Jump to latest",
		startOfHistory: "Beginning of the conversation",
		message: {
			user: "user message",
			assistant: "assistant message",
		},
		typing: "Responding",
		showMore: "Show more",
		showLess: "Show less",
		author: {
			lead: "Lead",
			deleted: "Deleted bot",
		},
		mention: {
			unknown: "Unknown bot",
		},
	},
	turn: {
		copy: "Copy",
		reply: "Reply",
		pin: "Pin",
		unpin: "Unpin",
		copied: "Copied",
		retry: "Retry",
		cancel: "Cancel this prompt",
		footer: {
			cancelled: "Stopped",
			failed: "This response failed",
			queued: "Waiting to be sent",
		},
	},
	reply: {
		label: "Replying to {{author}}",
		dismiss: "Cancel reply",
	},
	pinned: {
		title: "Pinned messages",
		counted_one: "Pinned messages, {{count}} pinned",
		counted_other: "Pinned messages, {{count}} pinned",
		jump: "Jump",
		jumpTo: "Jump to the message from {{author}}",
		unpin: "Unpin the message from {{author}}",
		empty: "No message is pinned in this conversation yet.",
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
		stop: "Stop {{name}}",
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
		commands: "Commands",
		mentions: "Bots",
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
	toolQuestion: {
		freeText: "Other answer",
		freeTextPlaceholder: "Write your own answer…",
		preview: "Preview",
		submit: "Send answers",
		next: "Next question",
		dismiss: "Dismiss",
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
	activity: {
		duration: {
			seconds: "{{seconds}}s",
			minutes: "{{minutes}}m",
			minutesAndSeconds: "{{minutes}}m {{seconds}}s",
		},
		active: {
			search: "Searching the web…",
			tool: "Running tools…",
			trace: "Working through the run…",
			mixed: "Working through it…",
			thinking: "Thinking…",
		},
		summary: {
			failed: "Failed after <duration>{{value}}</duration>",
			thought: "Thought for <duration>{{value}}</duration>",
			search: "Searched the web",
			tools_one: "Ran {{count}} tool",
			tools_other: "Ran {{count}} tools",
			toolCalls_one: "{{count}} tool call",
			toolCalls_other: "{{count}} tool calls",
			messages_one: "{{count}} message",
			messages_other: "{{count}} messages",
			trace: "{{toolCalls}}, {{messages}}",
			steps_one: "Completed {{count}} step",
			steps_other: "Completed {{count}} steps",
		},
		moreResults: "+{{count}} more",
	},
	screen: {
		label: "Claude Code conversation",
		identity: "{{name}} — bot settings",
		placeholder: "Ask {{name}} to do something…",
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
			binaryNotFound: "OpenNest's built-in agent is unreachable.",
			notAuthenticated:
				"Your Claude subscription is not signed in. Sign in to Claude, then start the conversation again.",
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
	newConversation: {
		title: "New conversation",
		description:
			"Name it, then pick who takes part. The first bot you pick leads the conversation.",
		name: {
			label: "Name",
			placeholder: "What this conversation is about",
		},
		search: {
			label: "Bots",
			placeholder: "Search bots",
		},
		picked: {
			lead: "Lead",
			dismiss: "Remove {{name}}",
		},
		empty: "No bot matches that search.",
		create: "Create conversation",
	},
	conversationSettings: {
		breadcrumb: "Settings",
		untitled: "Untitled conversation",
		tab: {
			general: "General",
			participants: "Participants",
			instructions: "Instructions",
			danger: "Danger zone",
		},
		name: {
			label: "Name",
			placeholder: "What this conversation is about",
		},
		instructions: {
			label: "Instructions",
			placeholder: "What every bot in this conversation should keep in mind",
		},
		participants: {
			label: "In this conversation",
			lead: "Lead",
			promote: "Give the lead to {{name}}",
			dismiss: "Dismiss {{name}}",
			last: "The last bot seated stays in the conversation.",
			all: "Every bot of the space is already in this conversation.",
		},
		danger: {
			delete: "Delete conversation",
			description:
				"The conversation and everything said in it go with it. The bots stay in the space.",
			confirm: {
				title: "Delete {{name}}?",
			},
		},
	},
} as const

export { chat }
