import type { BotAvatarBlot } from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import type {
	BotOutputStyle,
	BotPermissionMode,
	BotSkillContext,
	BotSkillEffort,
} from "@workspace/ui/components/bot-settings"

const bots = {
	roster: {
		label: "Conversations",
		create: "New companion",
		createMenu: "Create",
		conversation: {
			create: "New conversation",
			others: "+{{count}}",
			preview: "{{name}}: {{text}}",
		},
		empty: "No companions yet",
		unavailable: "Couldn't load your companions. Restart Kiroshi to retry.",
		mission: {
			state: {
				waiting: "waiting for you",
				failed: "blocked",
				ready: "ready to merge",
				working: "working",
			},
			unavailable: {
				title: "Couldn't load missions",
				description: "Restart Kiroshi to retry.",
			},
		},
		actions: "Actions for {{name}}",
		settings: "Settings",
		duplicate: "Duplicate",
		spaces: {
			label: "Spaces",
			lastSpace:
				"A companion stays in at least one space. To remove a companion from its last space, delete the companion.",
		},
		pin: "Pin",
		pinDrop: "Drop here to pin",
		unpin: "Unpin",
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
			none: "No companion selected",
			selected: "{{name}} selected, {{state}}",
		},
		section: {
			actions: "Actions for the {{name}} section",
			moveTo: "Move to section",
			none: "No section",
			create: "New section",
			createField: "New section name",
			createDefault: "New section",
			rename: "Rename",
			renameField: "Rename {{name}}",
			moveUp: "Move up",
			moveDown: "Move down",
			delete: "Delete",
			empty: "Drop a companion here",
		},
		seedRefused: "Your first companion couldn't be set up",
	},
	spaces: {
		label: "Spaces",
		switch: "Change space, {{name}} open",
		open: "Open {{name}}",
		moveUp: "Move up",
		moveDown: "Move down",
		create: "New space",
		settings: "Space settings",
		shortcut: "⌘{{rank}}",
		remove: {
			lastSpace: "A companion needs at least one space.",
			failed: "Couldn't remove this companion from the space. Retry.",
		},
	},
	dialog: {
		untitled: "Untitled companion",
		breadcrumb: "Settings",
		tab: {
			general: "General",
			appearance: "Appearance",
			instructions: "Instructions",
			skills: "Skills",
			applications: "Applications",
			secrets: "Secrets",
			history: "History",
			approvals: "Approvals",
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
			placeholder: "The system prompt this companion always runs with",
		},
		memory: {
			label: "Memory",
			hint: "What this companion remembers across conversations. Edit it or clear it; it keeps learning either way.",
			empty: "This companion has no memories yet.",
			save: "Save memory",
			clear: {
				action: "Clear",
				title: "Clear this companion's memory?",
				description:
					"It starts learning again from your next conversation. This can't be undone.",
				confirm: "Clear the memory",
			},
		},
	},
	history: {
		empty: "No changes yet.",
		unavailable: "Couldn't load the history. Reopen settings to retry.",
		summary_one:
			"Lists 1 change since {{date}}. Undoing one writes a new change, so nothing's ever removed.",
		summary_other:
			"Lists {{count}} changes since {{date}}. Undoing one writes a new change, so nothing's ever removed.",
		noMatch: "No change matches “{{text}}”.",
		retouches_one: "(1 go)",
		retouches_other: "({{count}} goes)",
		undone: "Undone above",
		day: {
			today: "Today",
			yesterday: "Yesterday",
		},
		search: {
			label: "Search the history",
			placeholder: "Search the history",
			clear: "Clear the search",
		},
		author: {
			user: "You",
		},
		diff: {
			show: "Show changes",
			hide: "Hide changes",
			loading: "Loading changes…",
			filename: "Changes",
		},
		undo: {
			action: "Undo",
			label: "Undo “{{title}}”",
			title: "Undo “{{title}}”?",
			description:
				"Everything goes back to how it was before this change. The undo is a change of its own, so you can undo it too.",
			confirm: "Undo this change",
		},
		change: {
			back: "History",
			date: "{{day}}, {{time}}",
			added_one: "1 line added",
			added_other: "{{count}} lines added",
			removed_one: "1 line removed",
			removed_other: "{{count}} lines removed",
			consequence: {
				counted_one:
					"Puts everything back to how it read before this change, across 1 file, and writes that as a new change you can undo too.",
				counted_other:
					"Puts everything back to how it read before this change, across {{count}} files, and writes that as a new change you can undo too.",
				uncounted:
					"Puts everything back to how it read before this change, and writes that as a new change you can undo too.",
			},
			unavailable:
				"Couldn't read the files of this change. Go back and open it again to retry.",
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
			files: "Files",
			advanced: "Advanced",
		},
		empty: {
			title: "No skills yet",
			description:
				"Write a skill this companion can reuse, and choose whether it loads on every turn.",
		},
		name: {
			label: "Name",
			placeholder: "release-notes",
			hint: "Lowercase letters, numbers and hyphens. The companion reads the description, not the name.",
		},
		description: {
			label: "Description",
			placeholder: "When this companion should use it",
		},
		whenToUse: {
			label: "When to use",
			placeholder: "The requests this skill answers",
		},
		budget: {
			label: "{{used}} of {{max}} characters",
			hint: "The description and when to use share one character budget.",
			over: "{{over}} characters over. Shorten either field to save.",
		},
		body: {
			label: "Body",
			placeholder: "Write the skill in markdown",
		},
		argumentHint: {
			label: "Argument hint",
			placeholder: "[version] [--draft]",
			hint: "What you're asked for when you run this skill yourself.",
		},
		arguments: {
			label: "Arguments",
			placeholder: "One argument per line",
		},
		paths: {
			label: "Paths",
			placeholder: "docs/**/*.md",
			hint: "One glob per line. The files that make this skill relevant.",
		},
		modelInvocation: {
			label: "Keep the companion from reaching for it",
			description:
				"Off, the companion decides from the description. On, only you can run it.",
		},
		userInvocable: {
			label: "Let you invoke it",
			description:
				"It shows in the command menu. Run it by name with the arguments above.",
		},
		preloaded: {
			label: "Preload this skill",
			tag: "Preloaded",
			description:
				"On, it's in this companion's prompt every turn. Off, the companion reads it only when needed.",
		},
		system: {
			tag: "System",
			notice:
				"Kiroshi writes this skill and keeps it current. It's read-only here.",
		},
		model: {
			label: "Model",
			placeholder: "The companion's own",
			hint: "Leave empty to use the companion's model.",
		},
		effort: {
			label: "Effort",
			default: "The companion's own",
			option: {
				low: "Low",
				medium: "Medium",
				high: "High",
			} as const satisfies Record<BotSkillEffort, string>,
		},
		context: {
			label: "Context",
			default: "The conversation it runs from",
			hint: "Fork runs the skill in a copy of the conversation. Agent and Run in the background only apply to a fork.",
			option: {
				shared: "Shared",
				fork: "Fork",
			} as const satisfies Record<BotSkillContext, string>,
		},
		shell: {
			label: "Shell",
			placeholder: "/bin/zsh",
			hint: "The shell this skill's commands run in. Leave empty to use your default.",
		},
		agent: {
			label: "Agent",
			placeholder: "The companion itself",
			hint: "Who runs the fork.",
		},
		background: {
			label: "Run in the background",
			description:
				"The fork finishes on its own while the conversation continues.",
		},
		allowedTools: {
			label: "Allowed tools",
			placeholder: "Read\nGrep",
			hint: "One tool name per line. Leave empty to allow every tool the companion has.",
		},
		disallowedTools: {
			label: "Disallowed tools",
			placeholder: "Bash",
		},
		hooks: {
			label: "Hooks",
			placeholder: '{\n  "PreToolUse": []\n}',
			hint: "What runs around this skill's turn, as the bundle defines it.",
		},
		license: {
			label: "License",
			placeholder: "MIT",
		},
		compatibility: {
			label: "Compatibility",
			placeholder: ">=1.4",
			hint: "What this skill needs from its runtime.",
		},
		metadata: {
			label: "Metadata",
			placeholder: '{\n  "author": "Ada Martin"\n}',
			hint: "Extra bundle data Kiroshi doesn't use. It's kept as is.",
		},
		leave: {
			title: "Leave without saving?",
			description:
				"You'll lose your unsaved changes. The saved skill stays as it is.",
			action: "Leave",
		},
		delete: {
			action: "Delete skill",
			description:
				"The companion can no longer use this skill. This can't be undone.",
			confirm: {
				title: "Delete {{name}}?",
			},
		},
		files: {
			back: "All files",
			save: "Save file",
			loading: "Loading file…",
			retry: "Try again",
			add: {
				label: "New file",
				placeholder: "reference/api.md",
				hint: "A path inside the skill's folder. The file opens empty.",
				action: "Add file",
			},
			text: {
				label: "Contents",
				placeholder: "What this file holds",
			},
			failure: {
				read: "Couldn't open this file. Retry.",
				write: "Couldn't save this file. Save again; your text is still here.",
				delete: "Couldn't delete this file. Retry.",
			},
			delete: {
				action: "Delete file",
				description:
					"The file is deleted from the skill's folder. This can't be undone.",
				confirm: {
					title: "Delete {{path}}?",
				},
			},
		},
	},
	applications: {
		untitled: "Untitled application",
		add: "Add application",
		create: "Add application",
		save: "Save changes",
		unsaved: "Unsaved changes",
		back: "All applications",
		paste: "Paste a configuration",
		intro: {
			companion:
				"What {{name}} connects to for tools it doesn’t have on its own.",
			space: "What every companion in {{name}} connects to.",
			spaceCounted_one: "What the one companion in {{name}} connects to.",
			spaceCounted_other:
				"What all {{count}} companions in {{name}} connect to.",
			profile: "What you connect to, in every space.",
		},
		footnote: {
			companion_one:
				"{{name}} also gets {{count}} application it didn’t add: {{sources}}.",
			companion_other:
				"{{name}} also gets {{count}} applications it didn’t add: {{sources}}.",
			source: {
				space: "{{count}} from {{name}}",
				profile: "{{count}} from your profile",
			},
			space:
				"Each companion here can add applications of its own, and you can add some for every space.",
			profile: "These reach every companion you have, in every space.",
		},
		open: "Open {{name}}",
		section: {
			connection: "Connection",
			secrets: "Secrets",
			advanced: "Advanced",
		},
		connection: {
			state: {
				connected: "Connected",
				needsAuthorization: "Needs authorization",
				connecting: "Connecting…",
				failed: "Couldn’t connect",
			},
			connect: "Connect",
			retry: "Retry",
			cancel: "Cancel",
			reopen: "Open the page again",
			disconnect: "Disconnect",
			row: {
				connect: "Connect {{name}}",
				retry: "Retry {{name}}",
			},
			waiting: "Waiting for your browser",
			description: {
				needsAuthorization:
					"{{name}} signs you in through your browser. Kiroshi keeps the token with this application’s secrets, never in the configuration below.",
				connecting:
					"A tab is open at {{host}}. Authorize Kiroshi there and this screen catches up on its own.",
				connected:
					"Authorized on {{date}}. Kiroshi refreshes the token on its own, and says so here if that ever stops working.",
				unsaved: "Available once this application is saved.",
			},
			confirm: {
				title: "Disconnect {{name}}?",
				description:
					"Kiroshi drops the token and asks {{name}} to forget it. This companion loses its {{name}} tools until you connect again.",
			},
			session: {
				title: "{{name}} was left out",
				description:
					"It’s waiting for your authorization, so this session ran without its tools.",
				action: "Open Applications",
			},
			refused: {
				title: "The sign-in stopped working",
				description_one:
					"Kiroshi couldn’t refresh the token, so {{name}}’s only tool was left out of {{companion}}’s {{sessions}}. Signing in again is usually all it takes.",
				description_other:
					"Kiroshi couldn’t refresh the token, so {{name}}’s {{count}} tools were left out of {{companion}}’s {{sessions}}. Signing in again is usually all it takes.",
				sessions_one: "last session",
				sessions_other: "last {{count}} sessions",
				action: "Sign in again",
			},
		},
		install: {
			signIn: {
				title: "{{name}} signs you in",
				description:
					"A browser tab opens as soon as you add it. Kiroshi keeps the token with this application’s secrets, and refreshes it on its own.",
				action: "Add and sign in",
			},
			key: {
				title: "{{name}} needs an API key",
				placeholder: "Starts with {{prefix}}",
				reveal: "Show",
				conceal: "Hide",
				revealLabel: "Show the API key",
				concealLabel: "Hide the API key",
				description: {
					companion:
						"Kept with this application’s secrets, never in the configuration. {{name}} sees the tools, never the key.",
					space:
						"Kept with this application’s secrets, never in the configuration. Every companion in {{name}} sees the tools, never the key.",
					profile:
						"Kept with this application’s secrets, never in the configuration. Every companion you have sees the tools, never the key.",
				},
			},
			none: "Nothing to set up. It runs on this machine, with no key and no sign-in.",
			unreviewed: {
				title: "Kiroshi hasn’t read this one",
				description: {
					reads:
						"Published on the MCP registry by {{publisher}}, {{date}}. It runs on this machine with your account’s access. Read what it does before you add it.",
					writes:
						"Published on the MCP registry by {{publisher}}, {{date}}. It runs on this machine with your account’s access, and it writes as well as reads. Read what it does before you add it.",
				},
			},
			tools: {
				title: "What it brings",
				count: {
					reads_one: "{{count}} tool, read only",
					reads_other: "{{count}} tools, read only",
					writes_one: "{{count}} tool, reads and writes",
					writes_other: "{{count}} tools, reads and writes",
				},
			},
			footnote: {
				companion:
					"Applications run on your machine, under your account. Adding one reopens {{name}}’s session so the tools are there straight away.",
				space:
					"Applications run on your machine, under your account. Adding one here gives every companion in {{name}} its tools.",
				profile:
					"Applications run on your machine, under your account. Adding one here gives every companion you have its tools, in every space.",
			},
			done: "Added",
		},
		notice:
			"This companion runs applications on your machine, under your account. Only add ones you trust.",
		empty: {
			title: {
				companion: "No applications of its own",
				space: "Nothing shared in {{name}} yet",
				profile: "No applications of your own",
			},
			description: {
				companion:
					"Add one here and this companion gets tools it doesn’t have on its own. It runs on your machine.",
				space: "Add one here and every companion in this space gets its tools.",
				profile:
					"Add one here and every companion you have gets its tools, in every space. Good for what is yours rather than a project’s.",
			},
		},
		catalogue: {
			search: {
				placeholder: "Search applications",
				hint: "Looks in the MCP registry too",
			},
			curated: {
				title: "Kiroshi knows these",
				subtitle: "Set up in one step, nothing to paste",
			},
			registry: {
				title: "From the MCP registry",
				subtitle: "Published by whoever wrote them. Read before you add.",
				rest: "Type a name above to search the published applications.",
				restCounted_one:
					"Type a name above to search {{count}} published application.",
				restCounted_other:
					"Type a name above to search {{count}} published applications.",
				searching: "Searching the MCP registry…",
				empty: "Nothing in the MCP registry matched {{query}}.",
				failed: "Couldn’t reach the MCP registry.",
				retry: "Retry",
			},
			nothing:
				"Nothing matched {{query}}. Try another name, or paste a configuration.",
			setup: {
				signIn: "Signs you in",
				apiKey: "Needs an API key",
				none: "Nothing to set up",
			},
		},
		unavailable: "Couldn't load applications. Reopen settings to retry.",
		name: {
			label: "Name",
			placeholder: "atlas",
			hint: "Lowercase letters, numbers and hyphens. The companion knows the application by this name.",
		},
		config: {
			label: "Configuration",
			placeholder:
				'{\n  "command": "npx",\n  "args": ["-y", "@scope/server"]\n}',
			hint: "Paste the JSON from the application's instructions. A local application names a command, a remote one a URL.",
			invalid: "This isn't a JSON object. Check the braces, commas and quotes.",
		},
		transport: {
			label: "Transport",
			hint: "A local application runs a command. A remote one connects to a URL.",
			option: {
				local: "Started on this machine",
				remote: "Reached over the network",
			},
		},
		command: {
			label: "Command",
			placeholder: "npx",
			hint: "The program this companion starts. It runs with your account's access.",
		},
		args: {
			label: "Arguments",
			placeholder: "-y\n@scope/server",
			hint: "One argument per line, in order.",
		},
		url: {
			label: "URL",
			placeholder: "https://example.com/mcp",
			hint: "The address this companion connects to. Nothing runs on your machine.",
		},
		endpoint: {
			label: "Endpoint",
			hint: "How Kiroshi reaches the URL. Streamable HTTP counts as HTTP.",
			option: {
				http: "HTTP",
				sse: "Server-sent events",
				ws: "WebSocket",
			},
		},
		headers: {
			label: "Headers",
			placeholder: "Authorization: Bearer token",
			hint: "One header per line, as name and value. Put the application's key here.",
		},
		secrets: {
			label: "Secrets",
			placeholder: "ATLAS_TOKEN=sk-...",
			hint: "One name and value per line. The application gets these secrets and no others.",
		},
		leave: {
			title: "Leave without saving?",
			description:
				"You'll lose your unsaved changes. The saved application stays as it is.",
			action: "Leave",
		},
		launch: {
			label: "What this starts",
			secrets: "Secrets",
			unknown: "Add a command or a URL to this configuration.",
			reveal: "Show the value of {{name}}",
			conceal: "Hide the value of {{name}}",
		},
		delete: {
			action: "Remove application",
			description: "This companion stops starting it. This can't be undone.",
			confirm: {
				title: "Remove {{name}}?",
			},
		},
	},
	secrets: {
		add: "Add secret",
		notice:
			"Kiroshi passes each value to what runs here and never shows it again.",
		unreadable: {
			title: "Couldn't load secrets",
			description: "Reopen settings to retry.",
		},
		empty: {
			title: "No secrets yet",
			description:
				"Add a secret to pass a value to what runs here. You won't see the value again.",
		},
		scope: {
			user: "You",
			space: "Space",
			bot: "Companion",
			server: "Application",
		},
		row: {
			scopes: "Defined in {{defined}} · Served from {{served}}",
			overridden: "Overridden by {{scope}}",
			overriding: "Overrides {{scope}}",
			replace: "Replace the value of {{name}}",
			remove: "Remove {{name}}",
		},
		set: {
			add: {
				title: "Add a secret",
				description:
					"The value goes to what runs here. You won't see it again.",
			},
			replace: {
				title: "Replace a value",
				description:
					"Type a new value for {{name}}. The current one stays hidden.",
			},
			name: {
				label: "Name",
				placeholder: "ATLAS_TOKEN",
				hint: "Capital letters, digits and underscores. Programs read the secret by this name.",
				invalid:
					"Use capital letters, digits and underscores, starting with a letter or an underscore.",
			},
			value: {
				label: "Value",
				hint: "Saved once and never shown again.",
			},
			submit: "Save secret",
			failed: "Couldn't save this secret. Retry.",
		},
		remove: {
			title: "Remove {{name}}?",
			description: "Nothing here receives it anymore. This can't be undone.",
			action: "Remove secret",
			failed: "Couldn't remove this secret. Retry.",
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
					hint: "The agent's standard answers.",
				},
			} as const satisfies Record<
				BotOutputStyle,
				{ label: string; hint: string }
			>,
		},
		directory: {
			label: "Folder",
			placeholder: "Choose a folder",
			browse: "Change",
		},
	},
	approvals: {
		mode: {
			label: "Default answer to a request",
			option: {
				auto: {
					label: "Decide alone",
					hint: "The companion decides on its own, within the rules below.",
				},
				default: {
					label: "Ask every time",
					hint: "You approve every tool the rules below don't cover.",
				},
				acceptEdits: {
					label: "Accept edits",
					hint: "File edits go through. You approve everything else.",
				},
				plan: {
					label: "Plan first",
					hint: "The companion reads and plans, and changes nothing until you approve.",
				},
				dontAsk: {
					label: "Never ask",
					hint: "You're never asked. Only the deny rules below stop the companion.",
				},
			} as const satisfies Record<
				BotPermissionMode,
				{ label: string; hint: string }
			>,
		},
		rule: {
			add: "Add",
			placeholder: "Bash(git status:*)",
			invalid: "Write a rule as Tool or Tool(specifier).",
			remove: "Remove the rule {{rule}}",
			allow: {
				label: "Allowed",
				hint: "Runs without asking you.",
				empty: "No allow rules yet.",
			},
			ask: {
				label: "Asked",
				hint: "Asks you every time, whatever the mode.",
				empty: "No ask rules yet.",
			},
			deny: {
				label: "Denied",
				hint: "Always refused, whatever the mode.",
				empty: "No deny rules yet.",
			},
		},
	},
	identity: {
		avatar: "Avatar",
		uploadedImage: "Uploaded image",
		current: "{{animal}}, {{colour}}",
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
		colour: {
			label: "Colour",
			none: "No colour",
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
		delete: "Delete companion",
		description:
			"The companion is deleted everywhere, not just removed from its spaces. This can't be undone.",
		confirm: {
			title: "Delete {{name}}?",
		},
	},
} as const

export { bots }
