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
		empty: "No secret stored yet. Add one above.",
		add: {
			action: "Add",
			key: {
				label: "Key",
				placeholder: "ANTHROPIC_API_KEY",
			},
			value: {
				label: "Value",
				placeholder: "sk-ant-...",
			},
		},
		value: {
			placeholder: "sk-ant-...",
		},
		edit: {
			action: "Replace {{key}}",
			label: "New value for {{key}}",
		},
		save: "Save",
		cancel: "Cancel",
		status: {
			stored: "Stored",
			saved: "Saved",
			missing: "Not set",
			unreadable: "Needs value",
			unavailable: "Unavailable",
		},
		from: {
			space: "From space",
			bot: "From bot",
			server: "From server",
		},
		overrides: {
			space: "Overrides space",
			bot: "Overrides bot",
			server: "Overrides server",
		},
		failure: {
			save: "Not saved",
			delete: "Not deleted",
		},
		delete: {
			action: "Delete {{key}}",
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
