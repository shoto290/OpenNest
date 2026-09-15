const settings = {
	breadcrumb: {
		title: "Réglages",
	},
	rail: {
		profile: "Profil",
		space: "Espace",
		secrets: "Secrets",
		appearance: "Apparence",
		notifications: "Notifications",
		language: "Langue",
		skills: "Compétences",
		applications: "Applications",
		history: "Historique",
		danger: "Zone sensible",
	},
	plugin: {
		author: {
			bot: "Un compagnon",
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
				label: "Un compagnon pose une question",
				description: "Il attend votre réponse pour continuer.",
			},
			permission: {
				label: "Un compagnon demande une autorisation",
				description:
					"Il attend votre autorisation pour lancer une commande ou modifier un fichier.",
			},
			turn: {
				label: "Un compagnon termine son tour",
				description: "Il a fini et attend votre prochain message.",
			},
		},
		sound: {
			label: "Son",
			switch: "Jouer un son",
			description:
				"Kiroshi joue un bref carillon à chaque notification, même quand votre système l'affiche en silence.",
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
				"Les compagnons présents uniquement dans cet espace sont supprimés avec lui. C'est irréversible.",
			last: "Vous ne pouvez pas supprimer votre dernier espace.",
			confirm: {
				title: "Supprimer {{name}} ?",
			},
		},
	},
} as const

export { settings }
