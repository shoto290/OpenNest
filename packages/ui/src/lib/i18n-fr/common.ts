const common = {
	boot: {
		status: "Démarrage d'OpenNest",
	},
	dialog: {
		close: "Fermer",
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
