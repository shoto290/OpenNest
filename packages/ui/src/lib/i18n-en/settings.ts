const settings = {
	breadcrumb: {
		title: "Settings",
	},
	rail: {
		profile: "Profile",
		appearance: "Appearance",
		notifications: "Notifications",
		language: "Language",
		skills: "Skills",
		history: "History",
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
} as const

export { settings }
