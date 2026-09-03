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
	conversationEmptyState: {
		description_one:
			"{{count}} bot is seated here and waiting on your first message.",
		description_other:
			"{{count}} bots are seated here and waiting on your first message.",
		hint: "Type your first message in the composer below",
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
		newMessages: "New messages",
		newCounted_one: "{{count}} new message",
		newCounted_other: "{{count}} new messages",
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
		cause: {
			label: "Routine report",
			unavailable: {
				title: "Routine reports could not be read",
				description:
					"The conversation is intact. What opened each report is missing until the next read.",
			},
		},
		mention: {
			unknown: "Unknown bot",
			counted_one: "{{count}} mention",
			counted_other: "{{count}} mentions",
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
		unavailable: {
			title: "Pinned messages are out of date",
			description:
				"The pins could not be read or changed. Try again in a moment.",
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
		mentioned_one: "{{count}} mention in the draft",
		mentioned_other: "{{count}} mentions in the draft",
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
		identity: "{{name}} — bot settings",
		conversationIdentity: "{{name}} — conversation settings",
		placeholder: "Ask {{name}} to do something…",
		permission: {
			description: "Claude Code is waiting on you before it runs this tool.",
			path: "Path",
		},
		question: {
			recall: "{{author}} is waiting on your answer",
		},
		attachmentsRefused: "Files not attached",
		restart: "Restart session",
		handover: {
			title: "{{first}} and {{second}} keep handing the turn to each other",
			description:
				"They have passed it back and forth three times. The turn carries on until you stop it.",
			stop: "Stop the turn",
		},
		notice: {
			crashed: "Claude Code stopped",
			resumeFailed: "Previous conversation could not be resumed",
			workingDirectoryRefused: "The bot's folder was not found",
			settingsRejected: "The bot's settings were not applied",
			serverEnvRejected: "A server was left out",
			unavailable: "Claude Code is unavailable",
			failed: "That request did not go through",
			readFailed: "Earlier messages not loaded",
		},
		transport: {
			binaryNotFound: "OpenNest's built-in agent is unreachable.",
			notAuthenticated:
				"Your Claude subscription is not signed in. Sign in to Claude, then start the conversation again.",
			authCheckFailed: "The sign-in check failed: {{detail}}",
			spawnFailed: "Claude Code could not be started: {{detail}}",
			startupTimeout: "Claude Code did not answer within {{timeoutMs}} ms.",
			crashed: "Claude Code exited (code {{code}}).",
			crashedDetail: "Claude Code exited (code {{code}}). {{detail}}",
			crashedUnknownCode: "Claude Code exited (code unknown).",
			crashedUnknownCodeDetail: "Claude Code exited (code unknown). {{detail}}",
			resumeFailed:
				"That conversation could not be resumed. Claude Code started a new one; your messages are still here.",
			workingDirectoryRefused:
				"{{path}} is not there any more. This bot is answering from the usual place instead.",
			invalidFrame: "An unreadable frame was skipped: {{detail}}",
			settingsRejected: "This bot's settings.json was not applied: {{detail}}",
			serverEnvRejected:
				"{{detail}}. The conversation carries on with the other servers.",
			notStarted: "No session is running.",
			turnAlreadyRunning: "A turn is already running.",
			transitionInProgress: "A session change is already in progress.",
			noActiveTurn: "There is no turn to interrupt.",
			staleRuntimeSession:
				"That session has been replaced. The one running now took its place.",
			unknownPermission: "Unknown permission request ({{id}}).",
			writeFailed: "The prompt could not be sent: {{detail}}",
			readFailed: "The earlier messages could not be read: {{detail}}",
			unknownFailure: "Something went wrong: {{detail}}",
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
	namelessConversation: {
		separator: ", ",
	},
	newConversation: {
		title: "New conversation",
		description:
			"Pick who takes part. The first bot you pick leads the conversation. Name it now, or let your first message name it.",
		name: {
			label: "Name",
			placeholder: "Left empty, your first message names it",
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
	routines: {
		panel: {
			label: "Routines",
			toggle: "Routines of this conversation",
			title: "Routines",
		},
		form: {
			new: "New routine",
			edit: "Edit routine",
			back: "Back to the routines",
			save: "Save routine",
			title: {
				label: "Title",
				placeholder: "Morning digest",
			},
			instruction: {
				label: "Instruction",
				placeholder: "Read what came in overnight and write a short digest.",
			},
			source: {
				label: "Trigger",
				placeholder: "Pick what fires this routine",
				tied: "The key and the configuration of a routine are tied to its trigger, so the trigger of a saved routine cannot be changed.",
			},
			expression: {
				label: "Cron expression",
				placeholder: "0 8 * * *",
			},
			path: {
				label: "Watched path",
				placeholder: "/notes/CHANGELOG.md",
			},
			webhook: {
				url: "Address",
				key: "Key",
				header: "Header name",
				copy: "Copy the {{field}} of this routine",
				copied: "{{field}} copied",
				reading: "The address and the key are being read.",
				pending:
					"The address, the key and the header name are available once the routine is saved.",
				failure: "The address and the key of this routine could not be read.",
			},
			filter: {
				label: "Filter",
				everyEvent: "Every event runs this routine.",
				add: "Add a row",
				row: "Row {{rank}}",
				remove: "Remove the row on {{field}}",
				matchMode: {
					label: "Run when",
					all: "Every row holds",
					any: "Any row holds",
				},
				field: {
					label: "Field",
					otherPath: "Another path",
				},
				path: {
					label: "Path",
					placeholder: "sender.address",
				},
				operator: {
					label: "Operator",
				},
				value: {
					label: "Value",
					true: "True",
					false: "False",
				},
				operators: {
					exists: "is present",
					not_exists: "is absent",
					equals: "equals",
					not_equals: "does not equal",
					contains: "contains",
					not_contains: "does not contain",
					starts_with: "starts with",
					ends_with: "ends with",
					gt: "is greater than",
					lt: "is less than",
				},
				fieldTypes: {
					string: "text",
					number: "number",
					boolean: "boolean",
					datetime: "date",
				},
			},
			error: {
				blankTitle: "A routine needs a title.",
				blankInstruction: "A routine needs an instruction.",
				unreadableExpression: "This expression cannot be read as a schedule.",
				unsupportedOperator:
					"{{operator}} does not fit a field declared as {{fieldType}}.",
			},
		},
		row: {
			delete: "Delete {{title}}",
			stopped: "Stopped itself",
		},
		confirm: {
			title: "Delete {{title}}?",
			description:
				"The routine and its run history go with it. Nothing it already said in this conversation is touched.",
			label: "Delete routine",
			failure: "The routine could not be deleted. Try again.",
		},
		empty: {
			title: "No routine yet",
			description:
				"A routine runs a bot of this conversation on its own, on a schedule or when a file it watches changes.",
		},
		failure: {
			read: {
				title: "Routines could not be read",
				description:
					"Nothing was changed. Try again to read the routines of this conversation.",
			},
			write: {
				title: "The routine could not be changed",
				description:
					"The change was not saved. Read the routines again to see where they stand.",
			},
		},
	},
} as const

export { chat }
