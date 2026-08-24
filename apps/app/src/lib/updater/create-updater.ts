import type { UpdaterPort } from "./updater-port"
import { updaterTransport } from "./updater-transport"

import { isDesktopHost } from "../host"

export const createUpdater = (): UpdaterPort =>
	isDesktopHost()
		? updaterTransport
		: { check: async () => null, restart: async () => undefined }
