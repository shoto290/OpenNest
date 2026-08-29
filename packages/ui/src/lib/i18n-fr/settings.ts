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
		notice: {
			space:
				"Les clés enregistrées ici répondent pour tous les bots de cet espace. Un bot, ou l'un de ses serveurs MCP, peut en remplacer une par sa propre valeur.",
			bot: "Les clés enregistrées ici répondent pour ce bot et pour tous les serveurs MCP qu'il démarre. L'un de ces serveurs peut en remplacer une par sa propre valeur.",
			server:
				"Les clés enregistrées ici répondent pour ce seul serveur, avant tout ce que le bot ou l'espace détient sous le même nom.",
		},
		unavailable:
			"Le coffre est injoignable : rien ne peut être enregistré ni supprimé pour l'instant.",
		empty:
			"Aucune clé enregistrée ni demandée. Nommez-en une ci-dessus pour lui donner une valeur, ou écrivez une référence de secret dans une configuration MCP et elle sera demandée ici.",
		add: {
			hint: "Lettres, chiffres et tirets bas. C'est le nom auquel une configuration se réfère, pas la valeur.",
			action: "Enregistrer la clé",
			key: {
				label: "Clé",
				placeholder: "ATLAS_TOKEN",
			},
			value: {
				label: "Valeur",
			},
		},
		value: {
			placeholder: "Collez la valeur",
		},
		status: {
			stored: "Enregistrée",
			missing: "Absente",
			unreadable: "À redonner",
			unavailable: "Indisponible",
		},
		from: {
			space: "Vient de cet espace",
			bot: "Vient de ce bot",
			server: "Vient de ce serveur",
		},
		shadowed: {
			space:
				"C'est cette valeur qui est utilisée, pas celle que cet espace détient sous le même nom.",
			bot: "C'est cette valeur qui est utilisée, pas celle que ce bot détient sous le même nom.",
			server:
				"C'est cette valeur qui est utilisée, pas celle que ce serveur détient sous le même nom.",
		},
		saved: {
			space: "Enregistrée dans cet espace.",
			bot: "Enregistrée dans ce bot.",
			server: "Enregistrée dans ce serveur.",
		},
		tookOver: {
			space: "C'est la valeur de cet espace qui sert maintenant.",
			bot: "C'est la valeur de ce bot qui sert maintenant.",
			server: "C'est la valeur de ce serveur qui sert maintenant.",
		},
		save: "Enregistrer",
		replace: "Remplacer",
		delete: {
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
		failure: {
			save: "Cette valeur n'a pas pu être enregistrée : la clé reste telle qu'elle était.",
			delete:
				"Cette valeur n'a pas pu être supprimée : la clé reste telle qu'elle était.",
		},
		vault: {
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
				label: "Nouvelle phrase secrète",
				notice:
					"Cette machine n'a pas de trousseau utilisable par cette app : les clés vivront dans un coffre chiffré à côté. Choisissez une phrase secrète maintenant : elle seule ouvre ce coffre, et rien ici ne peut la retrouver pour vous.",
				action: "Créer le coffre",
			},
		},
	},
} as const

export { settings }
