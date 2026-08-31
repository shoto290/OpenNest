const chat = {
	emptyState: {
		ready: {
			title: "Commencer avec Claude Code",
			description:
				"OpenNest dialogue avec son agent intégré. Rien ne quitte votre appareil.",
		},
		unavailable: {
			title: "Claude Code n'est pas disponible",
			description: "OpenNest n'atteint pas son agent intégré.",
		},
		settings: "Réglages du bot",
		hint: "Saisissez votre première invite dans le champ ci-dessous",
		setup: "Réessayer",
	},
	conversationEmptyState: {
		description_one:
			"{{count}} bot est présent ici et attend votre premier message.",
		description_many:
			"{{count}} bots sont présents ici et attendent votre premier message.",
		description_other:
			"{{count}} bots sont présents ici et attendent votre premier message.",
		hint: "Saisissez votre premier message dans le champ ci-dessous",
	},
	connection: {
		checking: "Vérification de Claude Code…",
		ready: "Claude Code est prêt",
		unavailable: "Claude Code indisponible",
		crashed: "Claude Code s'est arrêté",
	},
	transcript: {
		label: "Conversation",
		loadOlder: "Charger les messages plus anciens",
		jumpToLatest: "Aller au dernier message",
		startOfHistory: "Début de la conversation",
		message: {
			user: "message de l'utilisateur",
			assistant: "message de l'assistant",
		},
		typing: "Réponse en cours",
		showMore: "Afficher plus",
		showLess: "Afficher moins",
		author: {
			lead: "Chef",
			deleted: "Bot supprimé",
		},
		mention: {
			unknown: "Bot inconnu",
			counted_one: "{{count}} mention",
			counted_many: "{{count}} mentions",
			counted_other: "{{count}} mentions",
		},
	},
	turn: {
		copy: "Copier",
		reply: "Répondre",
		pin: "Épingler",
		unpin: "Retirer l'épingle",
		copied: "Copié",
		retry: "Réessayer",
		cancel: "Annuler cette invite",
		footer: {
			cancelled: "Arrêté",
			failed: "Cette réponse a échoué",
			queued: "En attente d'envoi",
		},
	},
	reply: {
		label: "Réponse à {{author}}",
		dismiss: "Annuler la réponse",
	},
	pinned: {
		title: "Messages épinglés",
		counted_one: "Messages épinglés, {{count}} épinglé",
		counted_many: "Messages épinglés, {{count}} épinglés",
		counted_other: "Messages épinglés, {{count}} épinglés",
		jump: "Aller",
		jumpTo: "Aller au message de {{author}}",
		unpin: "Retirer l'épingle du message de {{author}}",
		empty: "Aucun message n'est épinglé dans cette conversation.",
		unavailable: {
			title: "Les messages épinglés ne sont pas à jour",
			description:
				"Les épingles n'ont pas pu être lues ou modifiées. Réessayez dans un instant.",
		},
	},
	working: {
		name: "Sans nom",
		verb: {
			thinking: "réfléchit",
			searching: "cherche",
			working: "travaille",
			writing: "écrit",
			waiting: "vous attend",
		},
		state: "{{name}} {{verb}}…",
		labelled: "{{name}} · {{label}}",
		stop: "Arrêter {{name}}",
	},
	notice: {
		retry: "Réessayer",
		exhausted: "Limite de tentatives atteinte après {{attempts}} essais",
		dismiss: "Ignorer l'avis",
	},
	attachments: {
		label: "Pièces jointes",
		open: "Ouvrir {{name}}",
		remove: "Retirer {{name}}",
		attach: "Joindre des fichiers",
	},
	composer: {
		label: "Invite",
		placeholder: "Demandez à l'agent de faire quelque chose…",
		send: "Envoyer l'invite",
		commands: "Commandes",
		mentions: "Bots",
	},
	toolApproval: {
		title: "Autoriser cet outil à s'exécuter ?",
		status: {
			pending: "Autorisation requise",
			allowed: "Autorisé une fois",
			denied: "Refusé",
		},
		sensitive: "Masqué",
		input: "Entrée de l'outil",
		allowOnce: "Autoriser une fois",
		deny: "Refuser",
	},
	toolQuestion: {
		freeText: "Autre réponse",
		freeTextPlaceholder: "Écrivez votre propre réponse…",
		preview: "Aperçu",
		submit: "Envoyer les réponses",
		next: "Question suivante",
		dismiss: "Ignorer",
	},
	code: {
		snippet: "Extrait de code",
		namedSnippet: "Extrait de code, {{name}}",
		copy: "Copier le code",
		copied: "Copié",
		copyTooltip: "Copier",
		copyAnnounced: "Code copié dans le presse-papiers",
		copyFailed: "La copie du code a échoué",
		writing: "Écriture",
		ready: "Prêt",
	},
	table: {
		label: "Tableau",
		copy: "Copier le tableau",
		copyAnnounced: "Tableau copié dans le presse-papiers",
	},
	diagram: {
		label: "Diagramme",
	},
	task: {
		done: "Fait",
		todo: "À faire",
	},
	screen: {
		label: "Conversation Claude Code",
		identity: "{{name}} — réglages du bot",
		conversationIdentity: "{{name}} — réglages de la conversation",
		placeholder: "Demandez à {{name}} de faire quelque chose…",
		permission: {
			description: "Claude Code attend votre accord avant de lancer cet outil.",
			path: "Chemin",
		},
		question: {
			recall: "{{author}} attend votre réponse",
		},
		attachmentsRefused: "Fichiers non joints",
		restart: "Redémarrer la session",
		handover: {
			title: "{{first}} et {{second}} n'arrêtent pas de se passer le tour",
			description:
				"Ils se le sont renvoyé trois fois. Le tour continue tant que vous ne l'arrêtez pas.",
			stop: "Arrêter le tour",
		},
		notice: {
			crashed: "Claude Code s'est arrêté",
			resumeFailed: "La conversation précédente n'a pas pu être reprise",
			workingDirectoryRefused: "Le dossier du bot est introuvable",
			settingsRejected: "Les réglages du bot n'ont pas été appliqués",
			serverEnvRejected: "Un serveur a été laissé de côté",
			unavailable: "Claude Code est indisponible",
			failed: "Cette demande n'est pas passée",
			readFailed: "Messages précédents non chargés",
		},
		transport: {
			binaryNotFound: "L'agent intégré d'OpenNest est injoignable.",
			notAuthenticated:
				"Votre abonnement Claude n'est pas connecté. Connectez-vous à Claude, puis reprenez la conversation.",
			authCheckFailed: "La vérification de la connexion a échoué : {{detail}}",
			spawnFailed: "Claude Code n'a pas pu être démarré : {{detail}}",
			startupTimeout: "Claude Code n'a pas répondu en {{timeoutMs}} ms.",
			crashed: "Claude Code s'est arrêté (code {{code}}).",
			crashedUnknownCode: "Claude Code s'est arrêté (code inconnu).",
			resumeFailed:
				"Cette conversation n'a pas pu être reprise. Claude Code en a démarré une nouvelle ; vos messages sont toujours là.",
			workingDirectoryRefused:
				"{{path}} n'existe plus. Ce bot répond depuis l'emplacement habituel à la place.",
			invalidFrame: "Une trame illisible a été ignorée : {{detail}}",
			settingsRejected:
				"Le settings.json de ce bot n'a pas été appliqué : {{detail}}",
			serverEnvRejected:
				"{{detail}}. La conversation continue avec les autres serveurs.",
			notStarted: "Aucune session n'est en cours.",
			turnAlreadyRunning: "Un tour est déjà en cours.",
			transitionInProgress: "Un changement de session est déjà en cours.",
			noActiveTurn: "Il n'y a aucun tour à interrompre.",
			staleRuntimeSession:
				"Cette session a été remplacée. Celle qui tourne maintenant a pris sa place.",
			unknownPermission: "Demande d'autorisation inconnue ({{id}}).",
			writeFailed: "L'invite n'a pas pu être envoyée : {{detail}}",
			readFailed: "Les messages précédents n'ont pas pu être lus : {{detail}}",
			unknownFailure: "Quelque chose s'est mal passé : {{detail}}",
		},
		attachment: {
			megabytes: "{{size}} Mo",
			storage: "Les fichiers n'ont pas pu être enregistrés ({{failure}}).",
			unknownConversation:
				"Cette conversation n'est plus enregistrée. Rouvrez le bot et joignez-les à nouveau.",
			tooMany:
				"Une invite porte {{limit}} fichiers au maximum, et {{staged}} sont en attente.",
			tooLarge: "{{name}} dépasse les {{limit}} qu'un seul fichier peut peser.",
			tooLargeTogether:
				"Les fichiers en attente totalisent {{bytes}}, au-delà des {{limit}} qu'une invite peut porter.",
			unwritable: "Les fichiers n'ont pas pu être enregistrés : {{detail}}",
		},
	},
	namelessConversation: {
		separator: ", ",
	},
	newConversation: {
		title: "Nouvelle conversation",
		description:
			"Choisissez les participants. Le premier bot choisi mène la conversation. Nommez-la maintenant, ou laissez votre premier message la nommer.",
		name: {
			label: "Nom",
			placeholder: "Laissé vide, votre premier message la nomme",
		},
		search: {
			label: "Bots",
			placeholder: "Rechercher un bot",
		},
		picked: {
			lead: "Meneur",
			dismiss: "Retirer {{name}}",
		},
		empty: "Aucun bot ne correspond à cette recherche.",
		create: "Créer la conversation",
	},
	conversationSettings: {
		breadcrumb: "Paramètres",
		untitled: "Conversation sans nom",
		tab: {
			general: "Général",
			participants: "Participants",
			instructions: "Instructions",
			danger: "Zone de danger",
		},
		name: {
			label: "Nom",
			placeholder: "Le sujet de cette conversation",
		},
		instructions: {
			label: "Instructions",
			placeholder:
				"Ce que chaque bot de cette conversation doit garder en tête",
		},
		participants: {
			label: "Dans cette conversation",
			lead: "Meneur",
			promote: "Confier la conduite à {{name}}",
			dismiss: "Retirer {{name}}",
			last: "Le dernier bot reste dans la conversation.",
			all: "Tous les bots de l'espace sont déjà dans cette conversation.",
		},
		danger: {
			delete: "Supprimer la conversation",
			description:
				"La conversation et tout ce qui s'y est dit disparaissent. Les bots restent dans l'espace.",
			confirm: {
				title: "Supprimer {{name}} ?",
			},
		},
	},
} as const

export { chat }
