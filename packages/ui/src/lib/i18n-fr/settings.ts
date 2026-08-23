/** The user settings surface in French — the breadcrumb, the rail down the
 * left, the profile fields, the notification switches, the language tiles and the
 * appearance tiles. */
const settings = {
	breadcrumb: {
		title: "Réglages",
	},
	rail: {
		profile: "Profil",
		appearance: "Apparence",
		notifications: "Notifications",
		language: "Langue",
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
	notifications: {
		label: "Me prévenir quand",
		event: {
			question: {
				label: "Un bot pose une question",
				description:
					"Il s'est arrêté et attend une réponse que vous seul pouvez donner.",
			},
			permission: {
				label: "Un bot demande une permission",
				description:
					"Il veut lancer quelque chose ou modifier un fichier, et attend votre accord.",
			},
			turn: {
				label: "Un bot termine son tour",
				description: "Il a dit tout ce qu'il avait à dire et s'est tu.",
			},
		},
	},
	language: {
		label: "Langue",
		machine: "Système",
	},
	appearance: {
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
