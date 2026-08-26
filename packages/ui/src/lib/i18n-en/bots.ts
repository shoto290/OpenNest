import type { BotAvatarBlot } from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import type {
	BotOutputStyle,
	BotSkillContext,
	BotSkillEffort,
} from "@workspace/ui/components/bot-settings"

const bots = {
	roster: {
		label: "Conversations",
		create: "New bot",
		empty: "No bots yet",
		actions: "Actions for {{name}}",
		settings: "Settings",
		duplicate: "Duplicate",
		duplicateTo: "Duplicate to",
		delete: "Delete",
		working: "{{pose}}…",
		pose: {
			thinking: "thinking",
			searching: "searching",
			working: "working",
			writing: "writing",
			waiting: "waiting",
		},
		idle: "idle",
		announcement: {
			none: "No bot selected",
			selected: "{{name}} selected, {{state}}",
		},
		section: {
			actions: "Actions for the {{name}} section",
			moveTo: "Move to",
			none: "No section",
			create: "New section",
			createField: "New section name",
			createDefault: "New section",
			rename: "Rename",
			renameField: "Rename {{name}}",
			moveUp: "Move up",
			moveDown: "Move down",
			delete: "Delete",
			empty: "Drop a bot here",
		},
	},
	spaces: {
		label: "Spaces",
		switch: "Change space, {{name}} open",
		open: "Open {{name}}",
		create: "New space",
		settings: "Space settings",
		shortcut: "⌘{{rank}}",
	},
	resources: {
		label: "Resources",
		actions: "Actions for {{name}}",
		rename: "Rename {{name}}",
		item: "item",
		itemLead: "Item",
		menu: {
			rename: "Rename",
		},
		position: {
			before: "before",
			inside: "inside",
			after: "after",
		},
		move: {
			toTopLevel: "Move to top level",
			busy: "Wait for the current move to finish.",
			done: "Moved {{name}} {{position}} {{target}}.",
			doneAtTopLevel: "Moved {{name}} to the top level.",
			failed: "Move failed. {{name}} was restored.",
		},
		renameFailed: "Rename failed. {{name}} was restored.",
	},
	dialog: {
		untitled: "Untitled bot",
		breadcrumb: "Settings",
		tab: {
			general: "General",
			appearance: "Appearance",
			instructions: "Instructions",
			skills: "Skills",
			mcp: "MCP servers",
			history: "History",
			runtime: "Runtime",
			danger: "Danger zone",
		},
		name: {
			label: "Name",
			placeholder: "No name",
		},
		title: {
			label: "Title",
			placeholder: "Short role label",
		},
		instructions: {
			label: "Instructions",
			placeholder: "The system prompt this bot always runs with",
		},
		memory: {
			label: "Memory",
			hint: "What the bot has written down for itself across conversations. Correct it or wipe it — it keeps writing either way.",
			empty: "This bot has not written anything down yet.",
			save: "Save memory",
			clear: {
				action: "Clear",
				title: "Clear this bot's memory?",
				description:
					"Everything the bot has written down for itself is removed. It starts learning again from the next conversation.",
				confirm: "Clear the memory",
			},
		},
	},
	history: {
		empty: "Nothing has been changed here yet.",
		author: {
			user: "You",
		},
		diff: {
			show: "Show changes",
			hide: "Hide changes",
			loading: "Loading the changes…",
			filename: "Changes",
		},
		undo: {
			action: "Undo",
			title: "Undo “{{title}}”?",
			description:
				"Everything goes back to how it was before this change. It is written as a new change, so the history keeps both.",
			confirm: "Undo this change",
		},
	},
	skills: {
		untitled: "Untitled skill",
		add: "Add skill",
		create: "Add skill",
		save: "Save skill",
		unsaved: "Unsaved changes",
		back: "All skills",
		section: {
			instructions: "Instructions",
			triggering: "Triggering",
			execution: "Execution",
			tools: "Tools",
			advanced: "Advanced",
		},
		empty: {
			title: "No skills yet",
			description:
				"A skill is a piece of know-how to carry. Write one and choose whether it travels in every prompt.",
		},
		name: {
			label: "Name",
			placeholder: "release-notes",
			hint: "Lowercase letters, numbers and hyphens. It is the skill's identity — the description below is what the bot reads.",
		},
		description: {
			label: "Description",
			placeholder: "When this bot should reach for it",
		},
		whenToUse: {
			label: "When to use",
			placeholder: "The turns this skill is the right answer to",
		},
		budget: {
			label: "{{used}} of {{max}} characters",
			hint: "The description and when to use are read as one paragraph, and they are budgeted as one.",
			over: "Over the budget by {{over}} characters. Shorten either field before saving.",
		},
		body: {
			label: "Body",
			placeholder: "The markdown this skill is written in",
		},
		argumentHint: {
			label: "Argument hint",
			placeholder: "[version] [--draft]",
			hint: "What a reader invoking this skill by hand is prompted for.",
		},
		arguments: {
			label: "Arguments",
			placeholder: "One argument a line",
		},
		paths: {
			label: "Paths",
			placeholder: "docs/**/*.md",
			hint: "One glob a line. The files whose presence makes this skill worth reaching for.",
		},
		modelInvocation: {
			label: "Keep the bot from reaching for it",
			description:
				"Left off, the bot decides on its own from the description. Turned on, only a reader may invoke it.",
		},
		userInvocable: {
			label: "Let a reader invoke it",
			description:
				"It appears in the command menu, invoked by name with the arguments above.",
		},
		preloaded: {
			label: "Preload this skill",
			tag: "Preloaded",
			description:
				"A preloaded skill is in this bot's prompt on every turn. Left off, it stays on the disk as text the bot may go and read.",
		},
		system: {
			tag: "System",
			notice:
				"The host writes this skill and keeps it up to date. It is here to be read: what it says is decided where it is generated, not in this dialog.",
		},
		model: {
			label: "Model",
			placeholder: "The bot's own",
			hint: "Left empty, this skill's turn runs on the model the bot runs on.",
		},
		effort: {
			label: "Effort",
			default: "The bot's own",
			option: {
				low: "Low",
				medium: "Medium",
				high: "High",
			} as const satisfies Record<BotSkillEffort, string>,
		},
		context: {
			label: "Context",
			default: "The conversation it was reached from",
			hint: "A fork runs the skill in a copy of the conversation, with a runner of its own — which is the only place an agent and a background run mean anything.",
			option: {
				shared: "Shared",
				fork: "Fork",
			} as const satisfies Record<BotSkillContext, string>,
		},
		shell: {
			label: "Shell",
			placeholder: "/bin/zsh",
			hint: "What this skill's commands run in. Left empty, the machine's own.",
		},
		agent: {
			label: "Agent",
			placeholder: "The bot itself",
			hint: "Who the forked run is handed to.",
		},
		background: {
			label: "Run in the background",
			description:
				"The fork is left to finish on its own, and the conversation carries on without waiting for it.",
		},
		allowedTools: {
			label: "Allowed tools",
			placeholder: "Read\nGrep",
			hint: "One tool a name a line. Left empty, this skill's turn may use everything the bot may.",
		},
		disallowedTools: {
			label: "Disallowed tools",
			placeholder: "Bash",
		},
		hooks: {
			label: "Hooks",
			placeholder: '{\n  "PreToolUse": []\n}',
			hint: "What runs around this skill's turn, as the bundle spells it.",
		},
		license: {
			label: "License",
			placeholder: "MIT",
		},
		compatibility: {
			label: "Compatibility",
			placeholder: ">=1.4",
			hint: "What this skill needs of the runtime around it.",
		},
		metadata: {
			label: "Metadata",
			placeholder: '{\n  "author": "Ada Martin"\n}',
			hint: "Anything the bundle carries that nothing here reads. It is kept as it is.",
		},
		leave: {
			title: "Leave without saving?",
			description:
				"Everything typed since this skill was opened goes with it. The skill on the disk is left as it was.",
			action: "Leave",
		},
		delete: {
			action: "Delete skill",
			description:
				"Its description and its body go with it. This cannot be undone.",
			confirm: {
				title: "Delete {{name}}?",
			},
		},
	},
	mcp: {
		untitled: "Untitled server",
		add: "Add server",
		create: "Add server",
		save: "Save changes",
		unsaved: "Unsaved changes",
		back: "All servers",
		section: {
			connection: "Connection",
			environment: "Environment",
			advanced: "Advanced",
		},
		notice:
			"A server is a program this bot starts on your machine, under your account, the next time it runs. Add one only from a source you trust.",
		empty: {
			title: "No MCP servers yet",
			description:
				"An MCP server gives this bot tools it does not have on its own. Adding one lets this bot start that program on your machine.",
		},
		name: {
			label: "Name",
			placeholder: "atlas",
			hint: "Lowercase letters, numbers and hyphens. It is what the server is declared under and what the bot connects to it as.",
		},
		config: {
			label: "Configuration",
			placeholder:
				'{\n  "command": "npx",\n  "args": ["-y", "@scope/server"]\n}',
			hint: "JSON, copied from the server's own instructions. A local server names a command, its arguments and its environment; a remote one names a URL.",
			invalid:
				"This is not a JSON object, so there is nothing to save yet. Check the braces, the commas and the quotes.",
		},
		transport: {
			label: "Transport",
			hint: "It decides what the rest of the configuration says: a local server names a command to run, a remote one an address to reach.",
			option: {
				local: "Started on this machine",
				remote: "Reached over the network",
			},
		},
		command: {
			label: "Command",
			placeholder: "npx",
			hint: "The program this bot starts. It runs under your account, with what you can reach.",
		},
		args: {
			label: "Arguments",
			placeholder: "-y\n@scope/server",
			hint: "One argument a line, in the order the command takes them.",
		},
		url: {
			label: "URL",
			placeholder: "https://example.com/mcp",
			hint: "The address this bot connects to. Nothing is started on your machine.",
		},
		endpoint: {
			label: "Endpoint",
			hint: "The kind of endpoint the address is reached on. A remote server written without one is skipped, so it is always saved beside the URL. Streamable HTTP is the same endpoint as HTTP, and a file already spelling it that way is left alone.",
			option: {
				http: "HTTP",
				sse: "Server-sent events",
				ws: "WebSocket",
			},
		},
		headers: {
			label: "Headers",
			placeholder: "Authorization: Bearer token",
			hint: "One header a line, as name and value. This is where a server asks for a key.",
		},
		environment: {
			label: "Environment",
			placeholder: "ATLAS_TOKEN=sk-...",
			hint: "One name and value a line. The server starts with these, and nothing else this bot holds.",
		},
		leave: {
			title: "Leave without saving?",
			description:
				"Everything typed since this server was opened goes with it. The server on the disk is left as it was.",
			action: "Leave",
		},
		launch: {
			label: "What this starts",
			environment: "Environment",
			unknown: "This configuration names nothing to start or connect to.",
			reveal: "Show the value of {{name}}",
			conceal: "Hide the value of {{name}}",
		},
		delete: {
			action: "Remove server",
			description:
				"This bot stops starting it, and its configuration goes with it. This cannot be undone.",
			confirm: {
				title: "Remove {{name}}?",
			},
		},
	},
	runtime: {
		model: {
			label: "Model",
			placeholder: "Choose a model",
		},
		outputStyle: {
			label: "Answer style",
			option: {
				Concise: {
					label: "Concise",
					hint: "Short answers that lead with the result.",
				},
				default: {
					label: "Standard",
					hint: "Claude's standard answers.",
				},
			} as const satisfies Record<
				BotOutputStyle,
				{ label: string; hint: string }
			>,
		},
		directory: {
			label: "Working directory",
			placeholder: "Choose a folder",
			browse: "Change",
		},
		changesNothing: {
			label: "Cannot change anything itself",
			description:
				"This bot is refused the tools that edit files and run commands, so it cannot do either itself. It can still read, and anything else it carries — an MCP server, another bot it asks — is not held back by this.",
		},
	},
	identity: {
		avatar: "Avatar",
		uploadedImage: "Uploaded image",
		current: "{{animal}}, {{blot}}",
		animal: {
			label: "Animal",
			option: {
				rabbit: "Rabbit",
				cat: "Cat",
				bear: "Bear",
				chick: "Chick",
				dog: "Dog",
				mouse: "Mouse",
				owl: "Owl",
				koala: "Koala",
				skippy: "Skippy",
			} as const satisfies Record<BotAvatarAnimal, string>,
		},
		blot: {
			label: "Blot",
			none: "No blot",
			option: {
				red: "Red",
				yellow: "Yellow",
				green: "Green",
				cyan: "Cyan",
				blue: "Blue",
				purple: "Purple",
				pink: "Pink",
				orange: "Orange",
			} as const satisfies Record<BotAvatarBlot, string>,
		},
		picture: {
			label: "Picture",
			file: "Avatar image file",
			add: "Add picture",
			change: "Change picture",
			remove: "Remove picture",
		},
	},
	danger: {
		delete: "Delete bot",
		description:
			"Its avatar, instructions and working directory go with it. This cannot be undone.",
		confirm: {
			title: "Delete {{name}}?",
		},
	},
} as const

export { bots }
