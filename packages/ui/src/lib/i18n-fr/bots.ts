/** The bots surface in French — the roster, the resource tree, the settings
 * dialog and the delete it guards. */
const bots = {
	roster: {
		label: "Conversations",
		create: "Nouveau bot",
		empty: "Aucun bot pour l'instant",
		actions: "Actions pour {{name}}",
		settings: "Réglages",
		delete: "Supprimer",
		working: "{{pose}}…",
		pose: {
			thinking: "réfléchit",
			searching: "cherche",
			working: "travaille",
			writing: "écrit",
			waiting: "attend",
		},
		idle: "au repos",
		announcement: {
			none: "Aucun bot sélectionné",
			selected: "{{name}} sélectionné, {{state}}",
		},
	},
	resources: {
		label: "Ressources",
		actions: "Actions pour {{name}}",
		rename: "Renommer {{name}}",
		item: "élément",
		itemLead: "Élément",
		menu: {
			rename: "Renommer",
		},
		position: {
			before: "avant",
			inside: "dans",
			after: "après",
		},
		move: {
			toTopLevel: "Déplacer au niveau supérieur",
			busy: "Attendez la fin du déplacement en cours.",
			done: "{{name}} déplacé {{position}} {{target}}.",
			doneAtTopLevel: "{{name}} déplacé au niveau supérieur.",
			failed: "Déplacement échoué. {{name}} a été rétabli.",
		},
		renameFailed: "Renommage échoué. {{name}} a été rétabli.",
	},
	dialog: {
		untitled: "Bot sans titre",
		breadcrumb: "Réglages",
		tab: {
			general: "Général",
			appearance: "Apparence",
			instructions: "Instructions",
			skills: "Compétences",
			mcp: "Serveurs MCP",
			runtime: "Exécution",
			danger: "Zone sensible",
		},
		name: {
			label: "Nom",
			placeholder: "Sans nom",
		},
		title: {
			label: "Titre",
			placeholder: "Intitulé court du rôle",
		},
		instructions: {
			label: "Instructions",
			placeholder: "L'invite système avec laquelle ce bot tourne toujours",
		},
	},
	skills: {
		untitled: "Compétence sans titre",
		add: "Ajouter une compétence",
		create: "Ajouter la compétence",
		back: "Toutes les compétences",
		empty: {
			title: "Aucune compétence",
			description:
				"Une compétence est un savoir-faire que ce bot peut porter. Écrivez-en une et choisissez si elle voyage dans chaque invite.",
		},
		name: {
			label: "Nom",
			placeholder: "notes-de-version",
			hint: "Minuscules, chiffres et traits d'union. C'est l'identité de la compétence — c'est la description ci-dessous que le bot lit.",
		},
		description: {
			label: "Description",
			placeholder: "Quand ce bot doit y recourir",
		},
		body: {
			label: "Contenu",
			placeholder: "Le markdown dans lequel cette compétence est écrite",
		},
		preloaded: {
			label: "Précharger cette compétence",
			tag: "Préchargée",
			description:
				"Une compétence préchargée est dans l'invite de ce bot à chaque tour. Sinon, elle reste sur le disque comme un texte que le bot peut aller lire.",
		},
		delete: {
			action: "Supprimer la compétence",
			description:
				"Sa description et son contenu partent avec elle. C'est irréversible.",
			confirm: {
				title: "Supprimer {{name}} ?",
			},
		},
	},
	mcp: {
		untitled: "Serveur sans titre",
		add: "Ajouter un serveur",
		create: "Ajouter le serveur",
		save: "Enregistrer les modifications",
		back: "Tous les serveurs",
		notice:
			"Un serveur est un programme que ce bot démarre sur votre machine, sous votre compte, à sa prochaine exécution. N'en ajoutez un que depuis une source de confiance.",
		empty: {
			title: "Aucun serveur MCP",
			description:
				"Un serveur MCP donne à ce bot des outils qu'il n'a pas seul. En ajouter un l'autorise à démarrer ce programme sur votre machine.",
		},
		name: {
			label: "Nom",
			placeholder: "atlas",
			hint: "Minuscules, chiffres et traits d'union. C'est le nom sous lequel le serveur est déclaré et celui par lequel le bot s'y connecte.",
		},
		config: {
			label: "Configuration",
			placeholder:
				'{\n  "command": "npx",\n  "args": ["-y", "@scope/server"]\n}',
			hint: "Du JSON, repris des instructions du serveur. Un serveur local nomme une commande, ses arguments et son environnement ; un serveur distant nomme une URL.",
			invalid:
				"Ce n'est pas un objet JSON, il n'y a donc rien à enregistrer. Vérifiez les accolades, les virgules et les guillemets.",
		},
		launch: {
			label: "Ce que cela démarre",
			environment: "Environnement",
			unknown: "Cette configuration ne nomme rien à démarrer ni à joindre.",
			reveal: "Afficher la valeur de {{name}}",
			conceal: "Masquer la valeur de {{name}}",
		},
		delete: {
			action: "Retirer le serveur",
			description:
				"Ce bot cesse de le démarrer et sa configuration part avec lui. C'est irréversible.",
			confirm: {
				title: "Retirer {{name}} ?",
			},
		},
	},
	runtime: {
		model: {
			label: "Modèle",
			placeholder: "Choisissez un modèle",
		},
		directory: {
			label: "Dossier de travail",
			placeholder: "Choisissez un dossier",
			browse: "Changer",
		},
		changesNothing: {
			label: "Ne peut rien modifier lui-même",
			description:
				"Ce bot se voit refuser les outils qui modifient des fichiers et exécutent des commandes : il ne peut donc faire ni l'un ni l'autre lui-même. Il peut toujours lire, et tout ce qu'il embarque par ailleurs — un serveur MCP, un autre bot qu'il sollicite — n'est pas retenu par ce réglage.",
		},
	},
	identity: {
		avatar: "Avatar",
		uploadedImage: "Image importée",
		current: "{{animal}}, {{blot}}",
		animal: {
			label: "Animal",
			option: {
				rabbit: "Lapin",
				cat: "Chat",
				bear: "Ours",
				chick: "Poussin",
				dog: "Chien",
				mouse: "Souris",
				owl: "Hibou",
				koala: "Koala",
			},
		},
		blot: {
			label: "Tache",
			none: "Aucune tache",
			option: {
				red: "Rouge",
				yellow: "Jaune",
				green: "Vert",
				cyan: "Cyan",
				blue: "Bleu",
				purple: "Violet",
				pink: "Rose",
				orange: "Orange",
			},
		},
		picture: "Image",
		pictureFile: "Fichier image de l'avatar",
	},
	danger: {
		delete: "Supprimer le bot",
		description:
			"Son avatar, ses instructions et son dossier de travail partent avec lui. C'est irréversible.",
		confirm: {
			title: "Supprimer {{name}} ?",
		},
	},
} as const

export { bots }
