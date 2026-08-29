const settings = {
	breadcrumb: {
		title: "Réglages",
	},
	rail: {
		profile: "Profil",
		space: "Espace",
		appearance: "Apparence",
		notifications: "Notifications",
		language: "Langue",
		skills: "Compétences",
		history: "Historique",
		danger: "Zone sensible",
	},
	plugin: {
		author: {
			bot: "Un bot",
		},
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
		sound: {
			label: "Son",
			switch: "Jouer un son",
			description:
				"Un bref carillon à chaque notification, joué par l'application elle-même — pour l'entendre là où le système afficherait la notification en silence.",
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
	},
	space: {
		untitled: "Espace sans nom",
		name: {
			label: "Nom",
			placeholder: "Sans nom",
		},
		colour: {
			label: "Couleur",
			none: "Aucune couleur",
		},
		danger: {
			delete: "Supprimer l'espace",
			description:
				"Ses bots et son plugin partent avec lui. C'est irréversible.",
			last: "Le dernier espace ne peut pas être supprimé — l'application en garde toujours un.",
			confirm: {
				title: "Supprimer {{name}} ?",
			},
		},
	},
} as const

export { settings }
