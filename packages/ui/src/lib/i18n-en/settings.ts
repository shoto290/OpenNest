const settings = {
	breadcrumb: {
		title: "Settings",
	},
	rail: {
		profile: "Profile",
		space: "Space",
		appearance: "Appearance",
		notifications: "Notifications",
		language: "Language",
		skills: "Skills",
		secrets: "Secrets",
		history: "History",
		danger: "Danger zone",
	},
	plugin: {
		author: {
			bot: "A bot",
		},
	},
	profile: {
		name: {
			label: "Display name",
			placeholder: "No name",
		},
		picture: {
			file: "Profile picture file",
			add: "Add picture",
			change: "Change picture",
			remove: "Remove picture",
		},
	},
	notifications: {
		label: "Notify me when",
		event: {
			question: {
				label: "A bot asks a question",
				description:
					"It has stopped and is waiting on an answer only you can give.",
			},
			permission: {
				label: "A bot asks permission",
				description:
					"It wants leave to run something or change a file, and waits until you say.",
			},
			turn: {
				label: "A bot finishes its turn",
				description: "It has said everything it had to say and gone quiet.",
			},
		},
		sound: {
			label: "Sound",
			switch: "Play a sound",
			description:
				"A short chime with every notification, played by the app itself — so it is heard where the system would show a notification silently.",
		},
	},
	language: {
		label: "Language",
		machine: "System",
	},
	appearance: {
		scheme: {
			label: "Scheme",
			option: {
				light: "Light",
				dark: "Dark",
				system: "System",
			},
		},
		palette: {
			label: "Palette",
			option: {
				amber: "Amber",
				slate: "Slate",
				water: "Water",
				moss: "Moss",
				coral: "Coral",
				lavender: "Lavender",
			},
		},
	},
	space: {
		untitled: "Untitled space",
		name: {
			label: "Name",
			placeholder: "No name",
		},
		colour: {
			label: "Colour",
		},
		danger: {
			delete: "Delete space",
			description: "Its bots and its plugin go with it. This cannot be undone.",
			last: "The last space cannot be deleted — the app always keeps one.",
			confirm: {
				title: "Delete {{name}}?",
			},
		},
	},
	secrets: {
		notice: {
			space:
				"Keys stored here answer for every bot in this space. A bot, or one of its MCP servers, can override any of them with a value of its own.",
			bot: "Keys stored here answer for this bot and for every MCP server it starts. One of those servers can override any of them with a value of its own.",
			server:
				"Keys stored here answer for this server alone, ahead of anything the bot or the space holds under the same name.",
		},
		unavailable:
			"The secret store cannot be reached, so nothing can be stored or deleted right now.",
		empty:
			"No key stored and none asked for. Name one above to store a value for it, or write a secret reference in an MCP configuration and it is asked for here.",
		add: {
			hint: "Letters, digits and underscores. It is the name a configuration refers to, not the value.",
			action: "Store the key",
			key: {
				label: "Key",
				placeholder: "ATLAS_TOKEN",
			},
			value: {
				label: "Value",
			},
		},
		value: {
			placeholder: "Paste the value",
		},
		status: {
			stored: "Stored",
			missing: "Not set",
			unreadable: "Needs a new value",
			unavailable: "Unavailable",
		},
		from: {
			space: "From this space",
			bot: "From this bot",
			server: "From this server",
		},
		shadowed: {
			space:
				"This value is used instead of the one this space holds under the same name.",
			bot: "This value is used instead of the one this bot holds under the same name.",
			server:
				"This value is used instead of the one this server holds under the same name.",
		},
		saved: {
			space: "Saved to this space.",
			bot: "Saved to this bot.",
			server: "Saved to this server.",
		},
		tookOver: {
			space: "This space's value is used now.",
			bot: "This bot's value is used now.",
			server: "This server's value is used now.",
		},
		save: "Save",
		replace: "Replace",
		delete: {
			action: "Delete",
			title: "Delete {{key}}?",
			wider: {
				space: "Delete from the space",
				bot: "Delete from the bot",
				server: "Delete from the server",
			},
			confirm: {
				space:
					"This value belongs to the space, so every bot in it loses the key at once. A bot or a server holding its own value under that name keeps it. This cannot be undone.",
				bot: "This value belongs to the bot, so every server it starts loses the key at once. A server holding its own value under that name keeps it. This cannot be undone.",
				server:
					"This value belongs to the server, and the server loses the key at once. This cannot be undone.",
			},
		},
		failure: {
			save: "This value could not be stored, so the key is left as it was.",
			delete: "This value could not be deleted, so the key is left as it was.",
		},
		vault: {
			placeholder: "Your passphrase",
			rejected: "That passphrase did not open the vault. Nothing was changed.",
			open: {
				label: "Passphrase",
				notice:
					"This machine has no keychain this app can use, so the keys live in an encrypted vault beside it. Give the passphrase that vault was created with to open it for this session.",
				action: "Open the vault",
			},
			create: {
				label: "New passphrase",
				notice:
					"This machine has no keychain this app can use, so the keys will live in an encrypted vault beside it. Choose a passphrase now: it is the only thing that opens that vault, and nothing here can recover it for you.",
				action: "Create the vault",
			},
		},
	},
} as const

export { settings }
