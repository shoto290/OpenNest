import type { BotAvatarBlot } from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"

/** Every string a reader sees on the bots surface — the roster, the resource tree,
 * the settings dialog and the delete it guards. */
const bots = {
	roster: {
		label: "Conversations",
		create: "New bot",
		empty: "No bots yet",
		actions: "Actions for {{name}}",
		settings: "Settings",
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
	},
	skills: {
		untitled: "Untitled skill",
		add: "Add skill",
		create: "Add skill",
		back: "All skills",
		empty: {
			title: "No skills yet",
			description:
				"A skill is a piece of know-how this bot can carry. Write one and choose whether it travels in every prompt.",
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
		body: {
			label: "Body",
			placeholder: "The markdown this skill is written in",
		},
		preloaded: {
			label: "Preload this skill",
			tag: "Preloaded",
			description:
				"A preloaded skill is in this bot's prompt on every turn. Left off, it stays on the disk as text the bot may go and read.",
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
		back: "All servers",
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
			/** One key per animal, keyed by the id the identity carries, so an animal
			 * the engine gains and this catalogue has no name for fails the type check
			 * rather than rendering its id at a reader. */
			option: {
				rabbit: "Rabbit",
				cat: "Cat",
				bear: "Bear",
				chick: "Chick",
				dog: "Dog",
				mouse: "Mouse",
				owl: "Owl",
				koala: "Koala",
			} as const satisfies Record<BotAvatarAnimal, string>,
		},
		blot: {
			label: "Blot",
			none: "No blot",
			/** One key per tint, on the same terms as the animals above. */
			option: {
				coral: "Coral",
				amber: "Amber",
				moss: "Moss",
				water: "Water",
				sky: "Sky",
				lavender: "Lavender",
				rose: "Rose",
				slate: "Slate",
			} as const satisfies Record<BotAvatarBlot, string>,
		},
		picture: "Picture",
		pictureFile: "Avatar image file",
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
