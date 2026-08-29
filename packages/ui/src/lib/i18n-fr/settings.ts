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
		secrets: "Secrets",
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
	space: {
		untitled: "Espace sans nom",
		name: {
			label: "Nom",
			placeholder: "Sans nom",
		},
		colour: {
			label: "Couleur",
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
	secrets: {
		unavailable: "Coffre à secrets indisponible pour l'instant.",
		empty: "Aucun secret enregistré. Ajoutez-en un ci-dessus.",
		add: {
			action: "Ajouter",
			key: {
				label: "Clé",
				placeholder: "ANTHROPIC_API_KEY",
			},
			value: {
				label: "Valeur",
				placeholder: "sk-ant-...",
			},
		},
		value: {
			placeholder: "sk-ant-...",
		},
		edit: {
			action: "Remplacer {{key}}",
			label: "Nouvelle valeur pour {{key}}",
		},
		save: "Enregistrer",
		cancel: "Annuler",
		status: {
			stored: "Enregistrée",
			saved: "Enregistrée",
			missing: "Absente",
			unreadable: "À redonner",
			unavailable: "Indisponible",
		},
		from: {
			named: "De {{server}}",
			space: "De l'espace",
			bot: "Du bot",
			server: "Du serveur",
		},
		overrides: {
			space: "Prime l'espace",
			bot: "Prime le bot",
			server: "Prime le serveur",
		},
		failure: {
			save: "Non enregistrée",
			delete: "Non supprimée",
		},
		delete: {
			named: "Supprimer {{key}}",
			action: "Supprimer",
			title: "Supprimer {{key}} ?",
			wider: {
				space: "Supprimer de l'espace",
				bot: "Supprimer du bot",
				server: "Supprimer du serveur",
			},
			confirm: {
				space:
					"Cette valeur appartient à l'espace : tous ses bots perdent la clé d'un coup. Un bot ou un serveur qui détient sa propre valeur sous ce nom la garde. C'est irréversible.",
				bot: "Cette valeur appartient au bot : tous les serveurs qu'il démarre perdent la clé d'un coup. Un serveur qui détient sa propre valeur sous ce nom la garde. C'est irréversible.",
				server:
					"Cette valeur appartient au serveur, et le serveur perd la clé aussitôt. C'est irréversible.",
			},
		},
		vault: {
			mismatch: "Les deux ne correspondent pas.",
			placeholder: "Votre phrase secrète",
			rejected:
				"Cette phrase secrète n'a pas ouvert le coffre. Rien n'a été changé.",
			open: {
				label: "Phrase secrète",
				notice:
					"Cette machine n'a pas de trousseau utilisable par cette app : les clés vivent dans un coffre chiffré à côté. Donnez la phrase secrète avec laquelle ce coffre a été créé pour l'ouvrir le temps de la session.",
				action: "Ouvrir le coffre",
			},
			create: {
				repeat: "Répétez la phrase secrète",
				label: "Nouvelle phrase secrète",
				notice:
					"Cette machine n'a pas de trousseau utilisable par cette app : les clés vivront dans un coffre chiffré à côté. Choisissez une phrase secrète maintenant : elle seule ouvre ce coffre, et rien ici ne peut la retrouver pour vous.",
				action: "Créer le coffre",
			},
		},
	},
} as const

export { settings }
