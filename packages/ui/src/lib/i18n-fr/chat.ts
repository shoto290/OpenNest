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
		newMessages: "Nouveaux messages",
		newCounted_one: "{{count}} nouveau message",
		newCounted_many: "{{count}} nouveaux messages",
		newCounted_other: "{{count}} nouveaux messages",
		startOfHistory: "Début de la conversation",
		message: {
			user: "message de l'utilisateur",
			assistant: "message de l'assistant",
			mission: "mission ouverte",
		},
		typing: "Réponse en cours",
		showMore: "Afficher plus",
		showLess: "Afficher moins",
		author: {
			lead: "Chef",
			deleted: "Bot supprimé",
		},
		cause: {
			label: "Rapport de routine",
			unavailable: {
				title: "Les rapports de routine n'ont pas pu être lus",
				description:
					"La conversation est intacte. Ce qui a déclenché chaque rapport manque jusqu'à la prochaine lecture.",
				soloDescription:
					"Le fil est intact. Ce qui a déclenché chaque rapport manque jusqu'à la prochaine lecture.",
			},
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
		mentioned_one: "{{count}} mention dans le brouillon",
		mentioned_many: "{{count}} mentions dans le brouillon",
		mentioned_other: "{{count}} mentions dans le brouillon",
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
			crashedDetail: "Claude Code s'est arrêté (code {{code}}). {{detail}}",
			crashedUnknownCode: "Claude Code s'est arrêté (code inconnu).",
			crashedUnknownCodeDetail:
				"Claude Code s'est arrêté (code inconnu). {{detail}}",
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
	activity: {
		panel: {
			label: "Activité",
			toggle: "Activité",
			title: "Activité",
		},
		missions: {
			title: "Missions",
			none: "Aucune mission en cours",
			badge: {
				attention: "En attente d'une personne",
				done: "Prête à être fusionnée",
				failed: "Échouée",
			},
			closed: {
				open: "Missions terminées",
				title: "Missions terminées",
				back: "Retour à l'activité",
			},
		},
		routines: {
			title: "Routines",
		},
		failure: {
			missions: {
				title: "Les missions n'ont pas pu être lues",
				description:
					"Rien n'a été modifié. Réessayez pour lire les missions de cette conversation.",
			},
			routines: {
				title: "Les routines n'ont pas pu être lues",
				description: "Rien n'a été modifié. Réessayez pour lire les routines.",
			},
			activity: {
				title: "L'activité de cette conversation n'a pas pu être lue",
				description:
					"Rien n'a été modifié. Réessayez pour lire ses missions et ses routines.",
			},
			write: {
				title: "La routine n'a pas pu être modifiée",
				description:
					"La modification n'a pas été enregistrée. Relisez les routines pour voir où elles en sont.",
			},
		},
	},
	routines: {
		form: {
			new: "Nouvelle routine",
			edit: "Modifier la routine",
			back: "Retour aux routines",
			save: "Enregistrer la routine",
			title: {
				label: "Titre",
				placeholder: "Résumé du matin",
			},
			instruction: {
				label: "Instruction",
				placeholder:
					"Lis ce qui est arrivé cette nuit et écris un court résumé.",
			},
			source: {
				label: "Déclencheur",
				placeholder: "Choisissez ce qui déclenche cette routine",
				tied: "La clé et la configuration d'une routine tiennent à son déclencheur : celui d'une routine enregistrée ne peut plus changer.",
			},
			expression: {
				label: "Expression cron",
				placeholder: "0 8 * * *",
			},
			path: {
				label: "Fichier surveillé",
				placeholder: "/notes/CHANGELOG.md",
			},
			webhook: {
				url: "Adresse",
				key: "Clé",
				header: "Nom de l'en-tête",
				copy: "Copier {{field}} de cette routine",
				copied: "{{field}} copié",
				reading: "L'adresse et la clé sont en cours de lecture.",
				pending:
					"L'adresse, la clé et le nom de l'en-tête seront disponibles une fois la routine enregistrée.",
				failure: "L'adresse et la clé de cette routine n'ont pas pu être lues.",
			},
			filter: {
				label: "Filtre",
				everyEvent: "Chaque événement déclenche cette routine.",
				add: "Ajouter une ligne",
				row: "Ligne {{rank}}",
				remove: "Supprimer la ligne sur {{field}}",
				matchMode: {
					label: "Déclencher quand",
					all: "Chaque ligne est vraie",
					any: "Une ligne est vraie",
				},
				field: {
					label: "Champ",
					otherPath: "Un autre chemin",
				},
				path: {
					label: "Chemin",
					placeholder: "sender.address",
				},
				operator: {
					label: "Opérateur",
				},
				value: {
					label: "Valeur",
					true: "Vrai",
					false: "Faux",
				},
				operators: {
					exists: "est présent",
					not_exists: "est absent",
					equals: "est égal à",
					not_equals: "est différent de",
					contains: "contient",
					not_contains: "ne contient pas",
					starts_with: "commence par",
					ends_with: "finit par",
					gt: "est supérieur à",
					lt: "est inférieur à",
				},
				fieldTypes: {
					string: "texte",
					number: "nombre",
					boolean: "booléen",
					datetime: "date",
				},
			},
			error: {
				blankTitle: "Une routine a besoin d'un titre.",
				blankInstruction: "Une routine a besoin d'une instruction.",
				blankValue: "Cette ligne a besoin d'une valeur.",
				untypedComparison:
					"Cette comparaison a besoin d'un champ déclaré par le déclencheur.",
				unreadableExpression:
					"Cette expression n'est pas lisible comme un horaire.",
				unsupportedOperator:
					"{{operator}} ne convient pas à un champ déclaré {{fieldType}}.",
			},
		},
		detail: {
			title: "Routine",
			back: "Retour à la routine",
			runNow: {
				action: "Exécuter maintenant",
				refusal: {
					disabled: "Cette routine est éteinte, aucune exécution n'a démarré.",
					filter:
						"Le filtre de cette routine n'a rien laissé passer, aucune exécution n'a démarré.",
					dedupeValueMissing:
						"Ce déclencheur ne porte rien qui distingue un événement d'un autre, aucune exécution n'a démarré.",
					alreadySeen:
						"Cet événement a déjà été exécuté, aucune exécution n'a démarré.",
				},
			},
			history: {
				label: "Historique des exécutions",
				reading: "Lecture des exécutions de cette routine.",
				counted_one: "{{count}} exécution",
				counted_many: "{{count}} exécutions",
				counted_other: "{{count}} exécutions",
				page_one: "{{count}} dernière exécution lue",
				page_many: "{{count}} dernières exécutions lues",
				page_other: "{{count}} dernières exécutions lues",
				reported_one: "{{count}} rapport",
				reported_many: "{{count}} rapports",
				reported_other: "{{count}} rapports",
				latest: "La plus récente {{when}}",
				outcome: {
					reported: "Rapportée",
					nothing: "Rien à rapporter",
					skipped: "Ignorée",
					failed: "Échouée",
					running: "En cours",
				},
				empty: {
					title: "Aucune exécution enregistrée",
					description:
						"Aucune exécution de cette routine n'a été enregistrée. Les exécutions apparaissent ici au fil de l'eau.",
				},
				failure: {
					title: "Les exécutions n'ont pas pu être lues",
					description:
						"Rien n'a été modifié. Réessayez pour lire les exécutions de cette routine.",
				},
			},
		},
		row: {
			delete: "Supprimer {{title}}",
			stopped: "S'est arrêtée",
		},
		confirm: {
			title: "Supprimer {{title}} ?",
			description:
				"La routine et l'historique de ses exécutions disparaissent. Ce qu'elle a déjà dit reste.",
			label: "Supprimer la routine",
			failure: "La routine n'a pas pu être supprimée. Réessayez.",
		},
		empty: {
			title: "Aucune routine",
			description:
				"Une routine fait travailler un bot toute seule, sur un horaire ou quand un fichier qu'elle surveille change.",
		},
	},
	missions: {
		state: {
			working: "En cours",
			waiting_bot: "En attente du bot",
			waiting_human: "En attente de vous",
			ready_to_merge: "Prête à fusionner",
			failed: "En échec",
			done: "Terminée",
		},
		event: {
			opened: "Mission ouverte",
			note: "Note enregistrée",
			agent_asked: "Question envoyée à l'agent",
			answered: "L'agent a répondu",
			escalated: "Remontée à un humain",
			ready: "Prête à fusionner",
			failed: "Mission en échec",
			closed: "Mission fermée",
		},
		header: {
			tools: "Outils",
			back: "Retour à la conversation",
		},
		feed: {
			label: "Fil de la mission",
		},
		composer: {
			placeholder: "Répondre à cette mission…",
		},
		failure: {
			read: {
				title: "La mission n'a pas pu être lue",
				description: "Rien n'a été modifié. Réessayez pour lire cette mission.",
			},
			send: {
				title: "La réponse n'est pas parvenue au bot",
				description:
					"Rien n'a été enregistré sur la mission. Renvoyez votre réponse.",
			},
		},
	},
} as const

export { chat }
