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
			placeholder: "Le nom de cette compétence",
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
				coral: "Corail",
				amber: "Ambre",
				moss: "Mousse",
				water: "Eau",
				sky: "Ciel",
				lavender: "Lavande",
				rose: "Rose",
				slate: "Ardoise",
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
