/** The user settings surface in French — the breadcrumb, the rail down the
 * left, the profile fields and the appearance tiles. */
const settings = {
	breadcrumb: {
		title: "Réglages",
	},
	rail: {
		profile: "Profil",
		appearance: "Apparence",
	},
	profile: {
		name: {
			label: "Nom affiché",
			placeholder: "Sans nom",
		},
		picture: {
			file: "Fichier de photo de profil",
			add: "Ajouter une photo",
			change: "Changer la photo",
			remove: "Retirer la photo",
		},
	},
	appearance: {
		language: {
			label: "Langue",
		},
		scheme: {
			label: "Thème",
			option: {
				light: "Clair",
				dark: "Sombre",
				system: "Système",
			},
		},
		palette: {
			label: "Palette",
			option: {
				amber: "Ambre",
				slate: "Ardoise",
				water: "Eau",
				moss: "Mousse",
				coral: "Corail",
				lavender: "Lavande",
			},
		},
	},
} as const

export { settings }
