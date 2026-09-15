const bots = {
	roster: {
		label: "Conversations",
		create: "Nouveau compagnon",
		createMenu: "Créer",
		conversation: {
			create: "Nouvelle conversation",
			others: "+{{count}}",
			preview: "{{name}} : {{text}}",
		},
		empty: "Aucun compagnon pour l'instant",
		unavailable:
			"Impossible de charger vos compagnons. Redémarrez Kiroshi pour réessayer.",
		mission: {
			state: {
				waiting: "en attente de vous",
				failed: "bloquée",
				ready: "prête à fusionner",
				working: "en cours",
			},
			unavailable: {
				title: "Impossible de charger les missions",
				description: "Redémarrez Kiroshi pour réessayer.",
			},
		},
		actions: "Actions pour {{name}}",
		settings: "Réglages",
		duplicate: "Dupliquer",
		spaces: {
			label: "Espaces",
			lastSpace:
				"Un compagnon reste dans au moins un espace. Pour retirer un compagnon de son dernier espace, supprimez le compagnon.",
		},
		pin: "Épingler",
		pinDrop: "Déposer ici pour épingler",
		unpin: "Détacher",
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
			none: "Aucun compagnon sélectionné",
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
			empty: "Déposez un compagnon ici",
		},
		seedRefused: "Votre premier compagnon n'a pas pu être créé",
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
		remove: {
			lastSpace: "Un compagnon a besoin d'au moins un espace.",
			failed: "Impossible de retirer ce compagnon de l'espace. Réessayez.",
		},
	},
	dialog: {
		untitled: "Compagnon sans titre",
		breadcrumb: "Réglages",
		tab: {
			general: "Général",
			appearance: "Apparence",
			instructions: "Instructions",
			skills: "Compétences",
			applications: "Applications",
			secrets: "Secrets",
			history: "Historique",
			approvals: "Autorisations",
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
			placeholder:
				"L'invite système avec laquelle ce compagnon tourne toujours",
		},
		memory: {
			label: "Mémoire",
			hint: "Ce dont ce compagnon se souvient d'une conversation à l'autre. Modifiez-la ou effacez-la ; il continue d'apprendre.",
			empty: "Ce compagnon n'a encore aucun souvenir.",
			save: "Enregistrer la mémoire",
			clear: {
				action: "Effacer",
				title: "Effacer la mémoire de ce compagnon ?",
				description:
					"Il recommence à apprendre dès votre prochaine conversation. C'est irréversible.",
				confirm: "Effacer la mémoire",
			},
		},
	},
	history: {
		empty: "Aucune modification pour l'instant.",
		unavailable:
			"Impossible de charger l'historique. Rouvrez les réglages pour réessayer.",
		summary_one:
			"Liste 1 modification depuis le {{date}}. Annuler une modification en écrit une nouvelle : rien n'est jamais supprimé.",
		summary_many:
			"Liste {{count}} modifications depuis le {{date}}. Annuler une modification en écrit une nouvelle : rien n'est jamais supprimé.",
		summary_other:
			"Liste {{count}} modifications depuis le {{date}}. Annuler une modification en écrit une nouvelle : rien n'est jamais supprimé.",
		noMatch: "Aucune modification ne correspond à « {{text}} ».",
		retouches_one: "(1 fois)",
		retouches_many: "({{count}} fois)",
		retouches_other: "({{count}} fois)",
		undone: "Annulée plus haut",
		day: {
			today: "Aujourd'hui",
			yesterday: "Hier",
		},
		search: {
			label: "Rechercher dans l'historique",
			placeholder: "Rechercher dans l'historique",
			clear: "Effacer la recherche",
		},
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
			label: "Annuler « {{title}} »",
			title: "Annuler « {{title}} » ?",
			description:
				"Tout revient à l'état d'avant cette modification. L'annulation est une modification à part entière : vous pouvez l'annuler aussi.",
			confirm: "Annuler cette modification",
		},
		change: {
			back: "Historique",
			date: "{{day}}, {{time}}",
			added_one: "1 ligne ajoutée",
			added_many: "{{count}} lignes ajoutées",
			added_other: "{{count}} lignes ajoutées",
			removed_one: "1 ligne supprimée",
			removed_many: "{{count}} lignes supprimées",
			removed_other: "{{count}} lignes supprimées",
			consequence: {
				counted_one:
					"Remet tout dans l'état d'avant cette modification, sur 1 fichier, et écrit cela comme une nouvelle modification que vous pouvez annuler aussi.",
				counted_many:
					"Remet tout dans l'état d'avant cette modification, sur {{count}} fichiers, et écrit cela comme une nouvelle modification que vous pouvez annuler aussi.",
				counted_other:
					"Remet tout dans l'état d'avant cette modification, sur {{count}} fichiers, et écrit cela comme une nouvelle modification que vous pouvez annuler aussi.",
				uncounted:
					"Remet tout dans l'état d'avant cette modification, et écrit cela comme une nouvelle modification que vous pouvez annuler aussi.",
			},
			unavailable:
				"Impossible de lire les fichiers de cette modification. Revenez en arrière et rouvrez-la pour réessayer.",
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
			files: "Fichiers",
			advanced: "Avancé",
		},
		empty: {
			title: "Aucune compétence",
			description:
				"Écrivez une compétence que ce compagnon peut réutiliser, et choisissez si elle se charge à chaque tour.",
		},
		name: {
			label: "Nom",
			placeholder: "notes-de-version",
			hint: "Minuscules, chiffres et traits d'union. Le compagnon lit la description, pas le nom.",
		},
		description: {
			label: "Description",
			placeholder: "Quand ce compagnon doit l'utiliser",
		},
		whenToUse: {
			label: "Quand l'utiliser",
			placeholder: "Les demandes auxquelles cette compétence répond",
		},
		budget: {
			label: "{{used}} caractères sur {{max}}",
			hint: "La description et le quand l'utiliser partagent un même budget de caractères.",
			over: "{{over}} caractères de trop. Raccourcissez l'un des deux champs pour enregistrer.",
		},
		body: {
			label: "Contenu",
			placeholder: "Écrivez la compétence en markdown",
		},
		argumentHint: {
			label: "Indication d'arguments",
			placeholder: "[version] [--brouillon]",
			hint: "Ce qui vous est demandé quand vous lancez cette compétence vous-même.",
		},
		arguments: {
			label: "Arguments",
			placeholder: "Un argument par ligne",
		},
		paths: {
			label: "Chemins",
			placeholder: "docs/**/*.md",
			hint: "Un motif par ligne. Les fichiers qui rendent cette compétence pertinente.",
		},
		modelInvocation: {
			label: "Empêcher le compagnon d'y recourir",
			description:
				"Désactivé, le compagnon décide d'après la description. Activé, vous seul pouvez la lancer.",
		},
		userInvocable: {
			label: "Vous laisser l'invoquer",
			description:
				"Elle apparaît dans le menu de commandes. Lancez-la par son nom avec les arguments ci-dessus.",
		},
		preloaded: {
			label: "Précharger cette compétence",
			tag: "Préchargée",
			description:
				"Activé, elle est dans l'invite de ce compagnon à chaque tour. Désactivé, le compagnon la lit seulement au besoin.",
		},
		system: {
			tag: "Système",
			notice:
				"Kiroshi écrit cette compétence et la tient à jour. Elle est en lecture seule ici.",
		},
		model: {
			label: "Modèle",
			placeholder: "Celui du compagnon",
			hint: "Laissez vide pour utiliser le modèle du compagnon.",
		},
		effort: {
			label: "Effort",
			default: "Celui du compagnon",
			option: {
				low: "Faible",
				medium: "Moyen",
				high: "Élevé",
			},
		},
		context: {
			label: "Contexte",
			default: "La conversation d'où elle est lancée",
			hint: "Fork lance la compétence dans une copie de la conversation. Agent et Exécuter en arrière-plan ne valent que pour un fork.",
			option: {
				shared: "Partagé",
				fork: "Fork",
			},
		},
		shell: {
			label: "Shell",
			placeholder: "/bin/zsh",
			hint: "Le shell des commandes de cette compétence. Laissez vide pour utiliser celui par défaut.",
		},
		agent: {
			label: "Agent",
			placeholder: "Le compagnon lui-même",
			hint: "Qui exécute le fork.",
		},
		background: {
			label: "Exécuter en arrière-plan",
			description:
				"Le fork se termine de son côté pendant que la conversation continue.",
		},
		allowedTools: {
			label: "Outils autorisés",
			placeholder: "Read\nGrep",
			hint: "Un nom d'outil par ligne. Laissez vide pour autoriser tous les outils du compagnon.",
		},
		disallowedTools: {
			label: "Outils interdits",
			placeholder: "Bash",
		},
		hooks: {
			label: "Hooks",
			placeholder: '{\n  "PreToolUse": []\n}',
			hint: "Ce qui s'exécute autour du tour de cette compétence, tel que le bundle le définit.",
		},
		license: {
			label: "Licence",
			placeholder: "MIT",
		},
		compatibility: {
			label: "Compatibilité",
			placeholder: ">=1.4",
			hint: "Ce que cette compétence exige de son environnement.",
		},
		metadata: {
			label: "Métadonnées",
			placeholder: '{\n  "author": "Ada Martin"\n}',
			hint: "Données du bundle que Kiroshi n'utilise pas. Elles sont conservées telles quelles.",
		},
		leave: {
			title: "Quitter sans enregistrer ?",
			description:
				"Vous perdrez vos modifications non enregistrées. La compétence enregistrée reste telle quelle.",
			action: "Quitter",
		},
		delete: {
			action: "Supprimer la compétence",
			description:
				"Le compagnon ne pourra plus utiliser cette compétence. C'est irréversible.",
			confirm: {
				title: "Supprimer {{name}} ?",
			},
		},
		files: {
			back: "Tous les fichiers",
			save: "Enregistrer le fichier",
			loading: "Chargement du fichier…",
			retry: "Réessayer",
			add: {
				label: "Nouveau fichier",
				placeholder: "reference/api.md",
				hint: "Un chemin dans le dossier de la compétence. Le fichier s'ouvre vide.",
				action: "Ajouter le fichier",
			},
			text: {
				label: "Contenu",
				placeholder: "Ce que ce fichier contient",
			},
			failure: {
				read: "Impossible d'ouvrir ce fichier. Réessayez.",
				write:
					"Impossible d'enregistrer ce fichier. Enregistrez à nouveau ; votre texte est toujours là.",
				delete: "Impossible de supprimer ce fichier. Réessayez.",
			},
			delete: {
				action: "Supprimer le fichier",
				description:
					"Le fichier est supprimé du dossier de la compétence. C'est irréversible.",
				confirm: {
					title: "Supprimer {{path}} ?",
				},
			},
		},
	},
	applications: {
		untitled: "Application sans titre",
		add: "Ajouter une application",
		create: "Ajouter l'application",
		save: "Enregistrer les modifications",
		unsaved: "Modifications non enregistrées",
		back: "Toutes les applications",
		paste: "Coller une configuration",
		intro: {
			companion:
				"Ce à quoi {{name}} se connecte pour les outils qu'il n'a pas seul.",
			space: "Ce à quoi chaque compagnon de {{name}} se connecte.",
			spaceCounted_one: "Ce à quoi le seul compagnon de {{name}} se connecte.",
			spaceCounted_many:
				"Ce à quoi les {{count}} compagnons de {{name}} se connectent.",
			spaceCounted_other:
				"Ce à quoi les {{count}} compagnons de {{name}} se connectent.",
			profile: "Ce à quoi vous vous connectez, dans chaque espace.",
		},
		footnote: {
			companion_one:
				"{{name}} reçoit aussi {{count}} application qu'il n'a pas ajoutée : {{sources}}.",
			companion_many:
				"{{name}} reçoit aussi {{count}} applications qu'il n'a pas ajoutées : {{sources}}.",
			companion_other:
				"{{name}} reçoit aussi {{count}} applications qu'il n'a pas ajoutées : {{sources}}.",
			source: {
				space: "{{count}} depuis {{name}}",
				profile: "{{count}} depuis votre profil",
			},
			space:
				"Chaque compagnon d'ici peut ajouter ses propres applications, et vous pouvez en ajouter pour tous les espaces.",
			profile:
				"Elles parviennent à chacun de vos compagnons, dans chaque espace.",
		},
		open: "Ouvrir {{name}}",
		section: {
			connection: "Connexion",
			secrets: "Secrets",
			advanced: "Avancé",
		},
		connection: {
			state: {
				connected: "Connecté",
				needsAuthorization: "Autorisation requise",
				connecting: "Connexion…",
				failed: "Connexion impossible",
			},
			connect: "Connecter",
			retry: "Réessayer",
			cancel: "Annuler",
			reopen: "Rouvrir la page",
			disconnect: "Déconnecter",
			row: {
				connect: "Connecter {{name}}",
				retry: "Réessayer {{name}}",
			},
			waiting: "En attente de votre navigateur",
			description: {
				needsAuthorization:
					"{{name}} vous identifie via votre navigateur. Kiroshi garde le jeton avec les secrets de cette application, jamais dans la configuration ci-dessous.",
				connecting:
					"Un onglet est ouvert sur {{host}}. Autorisez Kiroshi là-bas et cet écran se met à jour tout seul.",
				connected:
					"Autorisé le {{date}}. Kiroshi renouvelle le jeton tout seul, et le dit ici si cela venait à ne plus fonctionner.",
				unsaved: "Disponible une fois cette application enregistrée.",
			},
			confirm: {
				title: "Déconnecter {{name}} ?",
				description:
					"Kiroshi abandonne le jeton et demande à {{name}} de l'oublier. Ce compagnon perd les outils de {{name}} jusqu'à une nouvelle connexion.",
			},
			session: {
				title: "{{name}} a été laissé de côté",
				description:
					"Il attend votre autorisation, cette session s'est donc déroulée sans ses outils.",
				action: "Ouvrir les applications",
			},
		},
		notice:
			"Ce compagnon lance ses applications sur votre machine, sous votre compte. Ajoutez seulement ceux en qui vous avez confiance.",
		empty: {
			title: {
				companion: "Aucune application à lui",
				space: "Rien de partagé dans {{name}} pour l'instant",
				profile: "Aucune application à vous",
			},
			description: {
				companion:
					"Ajoutez-en une ici et ce compagnon reçoit des outils qu'il n'a pas seul. Elle tourne sur votre machine.",
				space:
					"Ajoutez-en une ici et chaque compagnon de cet espace reçoit ses outils.",
				profile:
					"Ajoutez-en une ici et chacun de vos compagnons reçoit ses outils, dans chaque espace. Idéal pour ce qui est à vous plutôt qu'à un projet.",
			},
		},
		catalogue: {
			search: {
				placeholder: "Rechercher des applications",
				hint: "Cherche aussi dans le registre MCP",
			},
			curated: {
				title: "Kiroshi les connaît",
				subtitle: "Configurées en une étape, rien à coller",
			},
			registry: {
				title: "Depuis le registre MCP",
				subtitle:
					"Publiées par leurs auteurs, quels qu'ils soient. Lisez avant d'ajouter.",
				rest: "Tapez un nom ci-dessus pour chercher parmi les applications publiées.",
				restCounted_one:
					"Tapez un nom ci-dessus pour chercher parmi {{count}} application publiée.",
				restCounted_many:
					"Tapez un nom ci-dessus pour chercher parmi {{count}} applications publiées.",
				restCounted_other:
					"Tapez un nom ci-dessus pour chercher parmi {{count}} applications publiées.",
				searching: "Recherche dans le registre MCP…",
				empty: "Rien dans le registre MCP ne correspond à {{query}}.",
				failed: "Impossible de joindre le registre MCP.",
				retry: "Réessayer",
			},
			nothing:
				"Aucun résultat pour {{query}}. Essayez un autre nom, ou collez une configuration.",
			setup: {
				signIn: "Vous connecte",
				apiKey: "Demande une clé d'API",
				none: "Rien à configurer",
			},
		},
		unavailable:
			"Impossible de charger les applications. Rouvrez les réglages pour réessayer.",
		name: {
			label: "Nom",
			placeholder: "atlas",
			hint: "Minuscules, chiffres et traits d'union. Le compagnon connaît l'application sous ce nom.",
		},
		config: {
			label: "Configuration",
			placeholder:
				'{\n  "command": "npx",\n  "args": ["-y", "@scope/server"]\n}',
			hint: "Collez le JSON des instructions de l'application. Une application locale nomme une commande, une application distante une URL.",
			invalid:
				"Ce n'est pas un objet JSON. Vérifiez les accolades, les virgules et les guillemets.",
		},
		transport: {
			label: "Transport",
			hint: "Une application locale lance une commande. Une application distante se connecte à une URL.",
			option: {
				local: "Démarré sur cette machine",
				remote: "Joint par le réseau",
			},
		},
		command: {
			label: "Commande",
			placeholder: "npx",
			hint: "Le programme que ce compagnon démarre. Il tourne avec les accès de votre compte.",
		},
		args: {
			label: "Arguments",
			placeholder: "-y\n@scope/server",
			hint: "Un argument par ligne, dans l'ordre.",
		},
		url: {
			label: "URL",
			placeholder: "https://exemple.com/mcp",
			hint: "L'adresse à laquelle ce compagnon se connecte. Rien ne tourne sur votre machine.",
		},
		endpoint: {
			label: "Point d'accès",
			hint: "La façon dont Kiroshi joint l'URL. Streamable HTTP compte comme HTTP.",
			option: {
				http: "HTTP",
				sse: "Événements envoyés par le serveur",
				ws: "WebSocket",
			},
		},
		headers: {
			label: "En-têtes",
			placeholder: "Authorization: Bearer jeton",
			hint: "Un en-tête par ligne, nom et valeur. Mettez ici la clé de l'application.",
		},
		secrets: {
			label: "Secrets",
			placeholder: "ATLAS_TOKEN=sk-...",
			hint: "Un nom et une valeur par ligne. L'application reçoit ces secrets et aucun autre.",
		},
		leave: {
			title: "Partir sans enregistrer ?",
			description:
				"Vous perdrez vos modifications non enregistrées. L'application enregistrée reste telle quelle.",
			action: "Partir",
		},
		launch: {
			label: "Ce que cela démarre",
			secrets: "Secrets",
			unknown: "Ajoutez une commande ou une URL à cette configuration.",
			reveal: "Afficher la valeur de {{name}}",
			conceal: "Masquer la valeur de {{name}}",
		},
		delete: {
			action: "Retirer l'application",
			description: "Ce compagnon cesse de le démarrer. C'est irréversible.",
			confirm: {
				title: "Retirer {{name}} ?",
			},
		},
	},
	secrets: {
		add: "Ajouter un secret",
		notice:
			"Kiroshi transmet chaque valeur à ce qui tourne ici et ne l'affiche plus jamais.",
		unreadable: {
			title: "Impossible de charger les secrets",
			description: "Rouvrez les réglages pour réessayer.",
		},
		empty: {
			title: "Aucun secret",
			description:
				"Ajoutez un secret pour transmettre une valeur à ce qui tourne ici. Vous ne la reverrez plus.",
		},
		scope: {
			space: "Espace",
			bot: "Compagnon",
			server: "Application",
		},
		row: {
			scopes: "Défini dans {{defined}} · Servi depuis {{served}}",
			overridden: "Remplacé par {{scope}}",
			overriding: "Remplace {{scope}}",
			replace: "Remplacer la valeur de {{name}}",
			remove: "Retirer {{name}}",
		},
		set: {
			add: {
				title: "Ajouter un secret",
				description:
					"La valeur est transmise à ce qui tourne ici. Vous ne la reverrez plus.",
			},
			replace: {
				title: "Remplacer une valeur",
				description:
					"Saisissez une nouvelle valeur pour {{name}}. L'actuelle reste masquée.",
			},
			name: {
				label: "Nom",
				placeholder: "ATLAS_TOKEN",
				hint: "Majuscules, chiffres et tirets bas. Les programmes lisent le secret sous ce nom.",
				invalid:
					"Utilisez des majuscules, des chiffres et des tirets bas, en commençant par une lettre ou un tiret bas.",
			},
			value: {
				label: "Valeur",
				hint: "Enregistrée une fois, jamais réaffichée.",
			},
			submit: "Enregistrer le secret",
			failed: "Impossible d'enregistrer ce secret. Réessayez.",
		},
		remove: {
			title: "Retirer {{name}} ?",
			description: "Plus rien ici ne le reçoit. C'est irréversible.",
			action: "Retirer le secret",
			failed: "Impossible de retirer ce secret. Réessayez.",
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
					hint: "Les réponses standard de l'agent.",
				},
			},
		},
		directory: {
			label: "Dossier",
			placeholder: "Choisissez un dossier",
			browse: "Changer",
		},
	},
	approvals: {
		mode: {
			label: "Réponse par défaut à une demande",
			option: {
				auto: {
					label: "Décider seul",
					hint: "Le compagnon décide seul, dans les limites des règles ci-dessous.",
				},
				default: {
					label: "Demander à chaque fois",
					hint: "Vous validez chaque outil que les règles ci-dessous ne couvrent pas.",
				},
				acceptEdits: {
					label: "Accepter les modifications",
					hint: "Les modifications de fichiers passent. Vous validez tout le reste.",
				},
				plan: {
					label: "Planifier d'abord",
					hint: "Le compagnon lit et planifie, et ne change rien sans votre accord.",
				},
				dontAsk: {
					label: "Ne jamais demander",
					hint: "Rien ne vous est demandé. Seules les règles de refus ci-dessous arrêtent le compagnon.",
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
				empty: "Aucune règle d'autorisation.",
			},
			ask: {
				label: "Soumis",
				hint: "Vous est demandé à chaque fois, quel que soit le mode.",
				empty: "Aucune règle de demande.",
			},
			deny: {
				label: "Refusé",
				hint: "Toujours refusé, quel que soit le mode.",
				empty: "Aucune règle de refus.",
			},
		},
		directories: {
			label: "Autres dossiers",
			hint: "Les dossiers que le compagnon peut atteindre en plus du sien.",
			placeholder: "/Users/vous/notes",
			add: "Ajouter",
			empty: "Aucun dossier en plus du sien.",
			invalid: "Indiquez le chemin complet du dossier.",
			remove: "Retirer le dossier {{path}}",
		},
	},
	identity: {
		avatar: "Avatar",
		uploadedImage: "Image importée",
		current: "{{animal}}, {{colour}}",
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
		colour: {
			label: "Couleur",
			none: "Aucune couleur",
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
		delete: "Supprimer le compagnon",
		description:
			"Le compagnon est supprimé partout, pas seulement retiré de ses espaces. C'est irréversible.",
		confirm: {
			title: "Supprimer {{name}} ?",
		},
	},
} as const

export { bots }
