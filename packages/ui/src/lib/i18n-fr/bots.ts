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
			cancel: "Annuler",
		},
	},
} as const

export { bots }
