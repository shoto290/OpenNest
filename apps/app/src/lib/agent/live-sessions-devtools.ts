import type { LiveSession } from "./contract"
import { liveSessions } from "./transport"

declare global {
	interface Window {
		opennest?: { liveSessions: () => Promise<LiveSession[]> }
	}
}

const bindLiveSessions = () => {
	window.opennest = { liveSessions }
}

export const exposeLiveSessions = import.meta.env.DEV
	? bindLiveSessions
	: () => {}
