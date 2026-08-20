/** Every string a reader sees on the user settings surface — the breadcrumb, the
 * rail down the left, the profile fields and the appearance tiles. Scheme and
 * palette labels are keyed by the ids the value carries, so a palette added to the
 * app without a key here fails the type check rather than rendering its own id. */
const settings = {
	breadcrumb: {
		title: "Settings",
	},
	rail: {
		profile: "Profile",
		appearance: "Appearance",
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
