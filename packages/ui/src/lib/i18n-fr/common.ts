/** The French chrome every surface shares — the sidebar, the context menu, the
 * stateful button and the update pastille. */
const common = {
	sidebar: {
		label: "Barre latérale",
		toggle: "Afficher ou masquer la barre latérale",
		close: "Fermer la barre latérale",
	},
	contextMenu: {
		label: "Menu contextuel",
	},
	statefulButton: {
		loading: "Chargement",
		success: "Terminé",
		error: "Réessayer",
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
