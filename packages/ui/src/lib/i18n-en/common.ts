const common = {
	boot: {
		status: "Starting OpenNest",
	},
	spaces: {
		unavailable: {
			title: "Spaces could not be read",
			description:
				"Your bots are safe on the record. Try again to open your spaces.",
		},
	},
	dialog: {
		close: "Close",
		retry: "Try again",
	},
	confirm: {
		cancel: "Cancel",
	},
	sidebar: {
		label: "Sidebar",
		toggle: "Toggle sidebar",
		close: "Close sidebar",
		resize: "Resize sidebar",
	},
	contextMenu: {
		label: "Context menu",
	},
	notification: {
		question: "Asked you a question",
		permission: "Wants your permission",
		finishedTurn: "Finished its turn",
	},
	update: {
		badge: {
			available: "Download update",
			downloading: "Downloading update",
			ready: "Restart to update",
			error: "Update failed, download again",
		},
		panel: {
			title: "Update ready",
			version: "Version {{version}}",
			botsBusy_one: "{{count}} bot is still running. Stop them to restart.",
			botsBusy_other: "{{count}} bots are still running. Stop them to restart.",
			restart: "Restart now",
			postpone: "Later",
			releaseNotes: "Read the full release notes in your browser",
		},
	},
} as const

export { common }
