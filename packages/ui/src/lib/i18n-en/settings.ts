/** Every string a reader sees on the user settings surface — the breadcrumb, the
 * rail down the left, the profile fields, the notification switches, the language
 * tiles and the appearance tiles. Scheme, palette and notified-event labels are
 * keyed by the ids the value carries, so one added to the app without a key here
 * fails the type check rather than rendering its own id. The languages themselves
 * are not here: each is written in its own language, so English reads English in a
 * French interface. The machine tile is, because following the machine is a word of
 * the interface rather than a language. */
const settings = {
	breadcrumb: {
		title: "Settings",
	},
	rail: {
		profile: "Profile",
		appearance: "Appearance",
		notifications: "Notifications",
		language: "Language",
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
