import type { UpdaterPort } from "./updater-port"
import { updaterTransport } from "./updater-transport"

import { isDesktopHost } from "../host"

/** The Tauri host is the only build that can replace itself. `bun dev:web` runs no
 * release at all, so nothing is ever newer than what the tab is already showing. */
export const createUpdater = (): UpdaterPort =>
	isDesktopHost() ? updaterTransport : { check: async () => null }
