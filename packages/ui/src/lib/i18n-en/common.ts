const common = {
	boot: {
		status: "Starting OpenNest",
	},
	dialog: {
		close: "Close",
	},
	confirm: {
		cancel: "Cancel",
	},
	dropzone: {
		drop: "Drag, drop or paste an image",
		browse: "or click to choose a file",
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
	statefulButton: {
		loading: "Loading",
		success: "Done",
		error: "Try again",
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
