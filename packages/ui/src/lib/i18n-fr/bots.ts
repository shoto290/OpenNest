const bots = {
	roster: {
		label: "Conversations",
		create: "Nouveau bot",
		createMenu: "Créer",
		conversation: {
			create: "Nouvelle conversation",
			others: "+{{count}}",
			preview: "{{name}} : {{text}}",
		},
		empty: "Aucun bot pour l'instant",
		actions: "Actions pour {{name}}",
		settings: "Réglages",
		duplicate: "Dupliquer",
		duplicateTo: "Dupliquer vers un espace",
		pin: "Épingler",
		pinDrop: "Déposer ici pour épingler",
		unpin: "Détacher",
		moveToSpace: "Déplacer vers un espace",
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
		section: {
			actions: "Actions pour la section {{name}}",
			moveTo: "Déplacer vers une section",
			none: "Aucune section",
			create: "Nouvelle section",
			createField: "Nom de la nouvelle section",
			createDefault: "Nouvelle section",
			rename: "Renommer",
			renameField: "Renommer {{name}}",
			moveUp: "Monter",
			moveDown: "Descendre",
			delete: "Supprimer",
			empty: "Déposez un bot ici",
		},
	},
	spaces: {
		label: "Espaces",
		switch: "Changer d'espace, {{name}} ouvert",
		open: "Ouvrir {{name}}",
		moveUp: "Monter",
		moveDown: "Descendre",
		create: "Nouvel espace",
		settings: "Réglages des espaces",
		shortcut: "⌘{{rank}}",
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
			history: "Historique",
			permissions: "Permissions",
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
		memory: {
			label: "Mémoire",
			hint: "Ce que le bot a noté pour lui-même au fil des conversations. Corrigez-la ou effacez-la — il continue d'écrire.",
			empty: "Ce bot n'a encore rien noté.",
			save: "Enregistrer la mémoire",
			clear: {
				action: "Effacer",
				title: "Effacer la mémoire de ce bot ?",
				description:
					"Tout ce que le bot a noté pour lui-même est supprimé. Il recommence à apprendre dès la prochaine conversation.",
				confirm: "Effacer la mémoire",
			},
		},
	},
	history: {
		empty: "Rien n'a encore été modifié ici.",
		author: {
			user: "Vous",
		},
		diff: {
			show: "Afficher les modifications",
			hide: "Masquer les modifications",
			loading: "Chargement des modifications…",
			filename: "Modifications",
		},
		undo: {
			action: "Annuler",
			title: "Annuler « {{title}} » ?",
			description:
				"Tout revient à l'état d'avant cette modification. C'est écrit comme une nouvelle modification : l'historique garde les deux.",
			confirm: "Annuler cette modification",
		},
	},
	skills: {
		untitled: "Compétence sans titre",
		add: "Ajouter une compétence",
		create: "Ajouter la compétence",
		save: "Enregistrer la compétence",
		unsaved: "Modifications non enregistrées",
		back: "Toutes les compétences",
		section: {
			instructions: "Instructions",
			triggering: "Déclenchement",
			execution: "Exécution",
			tools: "Outils",
			advanced: "Avancé",
		},
		empty: {
			title: "Aucune compétence",
			description:
				"Une compétence est un savoir-faire à porter. Écrivez-en une et choisissez si elle voyage dans chaque invite.",
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
		whenToUse: {
			label: "Quand l'utiliser",
			placeholder: "Les tours auxquels cette compétence est la bonne réponse",
		},
		budget: {
			label: "{{used}} caractères sur {{max}}",
			hint: "La description et le quand l'utiliser se lisent comme un seul paragraphe : ils partagent le même budget.",
			over: "Budget dépassé de {{over}} caractères. Raccourcissez l'un des deux champs avant d'enregistrer.",
		},
		body: {
			label: "Contenu",
			placeholder: "Le markdown dans lequel cette compétence est écrite",
		},
		argumentHint: {
			label: "Indication d'arguments",
			placeholder: "[version] [--brouillon]",
			hint: "Ce qui est proposé à un lecteur qui invoque cette compétence à la main.",
		},
		arguments: {
			label: "Arguments",
			placeholder: "Un argument par ligne",
		},
		paths: {
			label: "Chemins",
			placeholder: "docs/**/*.md",
			hint: "Un motif par ligne. Les fichiers dont la présence rend cette compétence pertinente.",
		},
		modelInvocation: {
			label: "Empêcher le bot d'y recourir",
			description:
				"Sinon, le bot décide seul à partir de la description. Activé, seul un lecteur peut l'invoquer.",
		},
		userInvocable: {
			label: "Laisser un lecteur l'invoquer",
			description:
				"Elle apparaît dans le menu de commandes, invoquée par son nom avec les arguments ci-dessus.",
		},
		preloaded: {
			label: "Précharger cette compétence",
			tag: "Préchargée",
			description:
				"Une compétence préchargée est dans l'invite de ce bot à chaque tour. Sinon, elle reste sur le disque comme un texte que le bot peut aller lire.",
		},
		system: {
			tag: "Système",
			notice:
				"L'hôte écrit cette compétence et la tient à jour. Elle est ici pour être lue : ce qu'elle dit se décide là où elle est générée, pas dans cette fenêtre.",
		},
		model: {
			label: "Modèle",
			placeholder: "Celui du bot",
			hint: "Laissé vide, le tour de cette compétence tourne sur le modèle du bot.",
		},
		effort: {
			label: "Effort",
			default: "Celui du bot",
			option: {
				low: "Faible",
				medium: "Moyen",
				high: "Élevé",
			},
		},
		context: {
			label: "Contexte",
			default: "La conversation d'où elle est appelée",
			hint: "Un fork exécute la compétence dans une copie de la conversation, avec son propre moteur — le seul endroit où un agent et une exécution en arrière-plan ont un sens.",
			option: {
				shared: "Partagé",
				fork: "Fork",
			},
		},
		shell: {
			label: "Shell",
			placeholder: "/bin/zsh",
			hint: "Ce dans quoi les commandes de cette compétence s'exécutent. Laissé vide, celui de la machine.",
		},
		agent: {
			label: "Agent",
			placeholder: "Le bot lui-même",
			hint: "À qui l'exécution forkée est confiée.",
		},
		background: {
			label: "Exécuter en arrière-plan",
			description:
				"Le fork finit de son côté, et la conversation continue sans l'attendre.",
		},
		allowedTools: {
			label: "Outils autorisés",
			placeholder: "Read\nGrep",
			hint: "Un nom d'outil par ligne. Laissé vide, le tour de cette compétence peut utiliser tout ce que le bot peut utiliser.",
		},
		disallowedTools: {
			label: "Outils interdits",
			placeholder: "Bash",
		},
		hooks: {
			label: "Hooks",
			placeholder: '{\n  "PreToolUse": []\n}',
			hint: "Ce qui s'exécute autour du tour de cette compétence, tel que le bundle l'écrit.",
		},
		license: {
			label: "Licence",
			placeholder: "MIT",
		},
		compatibility: {
			label: "Compatibilité",
			placeholder: ">=1.4",
			hint: "Ce que cette compétence exige de l'environnement autour d'elle.",
		},
		metadata: {
			label: "Métadonnées",
			placeholder: '{\n  "author": "Ada Martin"\n}',
			hint: "Tout ce que le bundle porte et que rien ici ne lit. C'est conservé tel quel.",
		},
		leave: {
			title: "Quitter sans enregistrer ?",
			description:
				"Tout ce qui a été écrit depuis l'ouverture de cette compétence part avec. La compétence sur le disque reste telle quelle.",
			action: "Quitter",
		},
		delete: {
			action: "Supprimer la compétence",
			description:
				"Sa description et son contenu partent avec elle. C'est irréversible.",
			confirm: {
				title: "Supprimer {{name}} ?",
			},
		},
	},
	mcp: {
		untitled: "Serveur sans titre",
		add: "Ajouter un serveur",
		create: "Ajouter le serveur",
		save: "Enregistrer les modifications",
		unsaved: "Modifications non enregistrées",
		back: "Tous les serveurs",
		section: {
			connection: "Connexion",
			environment: "Environnement",
			advanced: "Avancé",
		},
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
		transport: {
			label: "Transport",
			hint: "C'est lui qui décide de ce que dit le reste de la configuration : un serveur local nomme une commande à lancer, un serveur distant une adresse à joindre.",
			option: {
				local: "Démarré sur cette machine",
				remote: "Joint par le réseau",
			},
		},
		command: {
			label: "Commande",
			placeholder: "npx",
			hint: "Le programme que ce bot démarre. Il tourne sous votre compte, avec ce que vous pouvez atteindre.",
		},
		args: {
			label: "Arguments",
			placeholder: "-y\n@scope/server",
			hint: "Un argument par ligne, dans l'ordre où la commande les prend.",
		},
		url: {
			label: "URL",
			placeholder: "https://exemple.com/mcp",
			hint: "L'adresse à laquelle ce bot se connecte. Rien n'est démarré sur votre machine.",
		},
		endpoint: {
			label: "Point d'accès",
			hint: "Le type de point d'accès sur lequel l'adresse est jointe. Un serveur distant écrit sans lui est ignoré, il est donc toujours enregistré à côté de l'URL. Streamable HTTP est le même point d'accès que HTTP, et un fichier qui l'écrit déjà ainsi est laissé tel quel.",
			option: {
				http: "HTTP",
				sse: "Événements envoyés par le serveur",
				ws: "WebSocket",
			},
		},
		headers: {
			label: "En-têtes",
			placeholder: "Authorization: Bearer jeton",
			hint: "Un en-tête par ligne, nom et valeur. C'est ici qu'un serveur demande une clé.",
		},
		environment: {
			label: "Environnement",
			placeholder: "ATLAS_TOKEN=sk-...",
			hint: "Un nom et une valeur par ligne. Le serveur démarre avec ceux-ci, et rien d'autre de ce que ce bot détient.",
		},
		leave: {
			title: "Partir sans enregistrer ?",
			description:
				"Tout ce qui a été tapé depuis l'ouverture de ce serveur part avec. Le serveur sur le disque reste tel qu'il était.",
			action: "Partir",
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
	environment: {
		add: "Ajouter une variable",
		notice:
			"Une valeur est écrite une fois et remise à ce qui démarre ici. Rien ne la relit, elle n'est donc jamais réaffichée — ni ici, ni ailleurs.",
		empty: {
			title: "Aucune variable",
			description:
				"Une variable est un nom et un secret remis à ce qui démarre ici. La valeur est écrite une fois et n'est jamais réaffichée.",
		},
		scope: {
			space: "Espace",
			bot: "Bot",
			server: "Serveur MCP",
		},
		row: {
			scopes: "Définie dans {{defined}} · Servie depuis {{served}}",
			overridden: "Remplacée par {{scope}}",
			overriding: "Remplace {{scope}}",
			replace: "Remplacer la valeur de {{name}}",
			remove: "Retirer {{name}}",
		},
		set: {
			add: {
				title: "Ajouter une variable",
				description:
					"La valeur est remise à ce qui démarre ici et n'est jamais réaffichée.",
			},
			replace: {
				title: "Remplacer une valeur",
				description:
					"La valeur stockée sous {{name}} est remplacée par celle saisie ici. Celle d'aujourd'hui n'est pas affichée et rien ici ne la lit.",
			},
			name: {
				label: "Nom",
				placeholder: "ATLAS_TOKEN",
				hint: "Majuscules, chiffres et tirets bas. C'est le nom que le programme lit.",
				invalid:
					"Un nom prend des majuscules, des chiffres et des tirets bas, et commence par une lettre ou un tiret bas.",
			},
			value: {
				label: "Valeur",
				hint: "Saisie une fois. Elle quitte ce champ pour le disque et n'est jamais relue.",
			},
			submit: "Enregistrer la variable",
			failed: "L'écriture a échoué. Rien n'a changé — réessayez.",
		},
		remove: {
			title: "Retirer {{name}} ?",
			description:
				"Le nom et sa valeur partent avec lui, et ce qui démarre ici cesse de les recevoir. C'est irréversible.",
			action: "Retirer la variable",
			failed: "La suppression a échoué. Rien n'a changé — réessayez.",
		},
	},
	runtime: {
		model: {
			label: "Modèle",
			placeholder: "Choisissez un modèle",
		},
		outputStyle: {
			label: "Style de réponse",
			option: {
				Concise: {
					label: "Concis",
					hint: "Des réponses courtes qui commencent par le résultat.",
				},
				default: {
					label: "Standard",
					hint: "Les réponses standard de Claude.",
				},
			},
		},
		directory: {
			label: "Dossier de travail",
			placeholder: "Choisissez un dossier",
			browse: "Changer",
		},
	},
	permissions: {
		mode: {
			label: "Réponse par défaut à une demande",
			option: {
				auto: {
					label: "Décider seul",
					hint: "Le bot décide seul, dans les limites des règles ci-dessous.",
				},
				default: {
					label: "Demander à chaque fois",
					hint: "Tout outil que les règles ci-dessous ne tranchent pas vous est soumis.",
				},
				acceptEdits: {
					label: "Accepter les modifications",
					hint: "Les modifications de fichiers passent sans demander ; le reste vous est soumis.",
				},
				plan: {
					label: "Planifier d'abord",
					hint: "Le bot lit et planifie, et ne change rien tant que vous ne l'avez pas dit.",
				},
				dontAsk: {
					label: "Ne jamais demander",
					hint: "Rien ne vous est soumis : seules les règles refusées retiennent le bot.",
				},
			},
		},
		rule: {
			add: "Ajouter",
			placeholder: "Bash(git status:*)",
			invalid: "Écrivez une règle sous la forme Outil ou Outil(spécificateur).",
			remove: "Retirer la règle {{rule}}",
			allow: {
				label: "Autorisé",
				hint: "S'exécute sans vous demander.",
				empty: "Rien n'est autorisé d'emblée.",
			},
			ask: {
				label: "Soumis",
				hint: "Vous est soumis à chaque fois, quel que soit le mode.",
				empty: "Rien ne vous est soumis d'office.",
			},
			deny: {
				label: "Refusé",
				hint: "Refusé d'emblée, quel que soit le mode.",
				empty: "Rien n'est refusé d'emblée.",
			},
		},
		directories: {
			label: "Autres dossiers",
			hint: "Les dossiers que le bot peut atteindre en plus de son dossier de travail.",
			placeholder: "/Users/vous/notes",
			add: "Ajouter",
			empty: "Aucun dossier en plus du dossier de travail.",
			invalid: "Indiquez le chemin complet du dossier.",
			remove: "Retirer le dossier {{path}}",
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
				skippy: "Skippy",
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
		picture: {
			label: "Image",
			file: "Fichier image de l'avatar",
			add: "Ajouter une image",
			change: "Changer l'image",
			remove: "Retirer l'image",
		},
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
