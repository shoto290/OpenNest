/** Every string a reader sees on the chrome every surface shares — the boot
 * screen, the sidebar, the context menu, the dialog frame, the picture dropzone,
 * the stateful button and the update pastille. These belong to no single surface,
 * so they answer to none of their namespaces. */
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
	},
	contextMenu: {
		label: "Context menu",
	},
	statefulButton: {
		loading: "Loading",
		success: "Done",
		error: "Try again",
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
