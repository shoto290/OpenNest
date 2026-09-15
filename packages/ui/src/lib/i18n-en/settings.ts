const settings = {
	breadcrumb: {
		title: "Settings",
	},
	rail: {
		profile: "Profile",
		space: "Space",
		secrets: "Secrets",
		appearance: "Appearance",
		notifications: "Notifications",
		language: "Language",
		skills: "Skills",
		applications: "Applications",
		history: "History",
		danger: "Danger zone",
	},
	plugin: {
		author: {
			bot: "A companion",
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
				label: "A companion asks a question",
				description: "It's paused until you answer.",
			},
			permission: {
				label: "A companion asks for approval",
				description:
					"It's waiting for your approval to run a command or edit a file.",
			},
			turn: {
				label: "A companion finishes its turn",
				description: "It's done and waiting for your next message.",
			},
		},
		sound: {
			label: "Sound",
			switch: "Play a sound",
			description:
				"Kiroshi plays a short chime with every notification, even when your system shows it silently.",
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
	},
	space: {
		untitled: "Untitled space",
		name: {
			label: "Name",
			placeholder: "No name",
		},
		colour: {
			label: "Colour",
			none: "No colour",
		},
		danger: {
			delete: "Delete space",
			description:
				"Companions that are only in this space are deleted with it. This can't be undone.",
			last: "You can't delete your last space.",
			confirm: {
				title: "Delete {{name}}?",
			},
		},
	},
} as const

export { settings }
