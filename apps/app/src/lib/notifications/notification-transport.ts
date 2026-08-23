import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type { NotificationPort } from "./notification-port"

/** Where the host reports a click, carrying the bot the notification was sent
 * with. Spelled the same in `src-tauri/src/notifications/commands.rs`. */
const ACTIVATED_EVENT = "notification://activated"

export const notificationTransport: NotificationPort = {
	/** Nothing is asked before sending, and nothing is reported back: whether a
	 * notification is shown at all is the platform's, and a reader who refused
	 * them in system settings is indistinguishable from one who was told.
	 *
	 * The bot goes with it. The host decides where it can land — on macOS the
	 * notification is kept until the reader answers it, everywhere else it is
	 * shown and forgotten — and returns as soon as it is on screen, so nothing
	 * here waits on the reader. */
	send: async ({ botId, title, body }) => {
		try {
			await invoke("notification_show", { botId, title, body })
		} catch {
			// A platform that will not take a notification is a platform that shows
			// none. There was nothing else this call was going to do.
		}
	},

	/** Every click on every notification this app showed, told to this listener.
	 * Only clicks arrive — a notification closed or timed out emits nothing —
	 * and only on macOS, the one host that keeps a notification long enough to
	 * hear back from it.
	 *
	 * Routing the click is the caller's: bringing the window back is not needed
	 * here, `src-tauri/src/lib.rs` already unminimizes, shows and focuses it. */
	onActivate: (listener) =>
		listen<string>(ACTIVATED_EVENT, (event) => listener(event.payload)),
}
