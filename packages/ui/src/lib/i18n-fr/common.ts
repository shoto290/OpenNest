const common = {
	boot: {
		status: "Démarrage d'OpenNest",
	},
	spaces: {
		unavailable: {
			title: "Les espaces n'ont pas pu être lus",
			description: "Vos bots sont intacts. Réessayez pour ouvrir vos espaces.",
		},
	},
	dialog: {
		close: "Fermer",
		retry: "Réessayer",
	},
	confirm: {
		cancel: "Annuler",
	},
	sidebar: {
		label: "Barre latérale",
		toggle: "Afficher ou masquer la barre latérale",
		close: "Fermer la barre latérale",
		resize: "Redimensionner la barre latérale",
	},
	contextMenu: {
		label: "Menu contextuel",
	},
	notice: {
		label: "Avis",
		close: "Fermer l'avis",
	},
	notification: {
		question: "Vous a posé une question",
		permission: "Demande votre permission",
		finishedTurn: "A terminé son tour",
	},
	update: {
		badge: {
			available: "Télécharger la mise à jour",
			downloading: "Téléchargement de la mise à jour",
			ready: "Redémarrer pour mettre à jour",
			error: "Mise à jour échouée, télécharger à nouveau",
		},
		panel: {
			title: "Mise à jour prête",
			version: "Version {{version}}",
			botsBusy_one: "{{count}} bot tourne encore. Arrêtez-le pour redémarrer.",
			botsBusy_many:
				"{{count}} bots tournent encore. Arrêtez-les pour redémarrer.",
			botsBusy_other:
				"{{count}} bots tournent encore. Arrêtez-les pour redémarrer.",
			restart: "Redémarrer maintenant",
			postpone: "Plus tard",
			releaseNotes: "Lire les notes de version complètes dans votre navigateur",
		},
	},
} as const

export { common }
