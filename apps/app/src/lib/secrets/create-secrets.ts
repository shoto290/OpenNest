import type { SecretPort } from "./secret-port"
import { secretTransport } from "./secret-transport"

import { isDesktopHost } from "../host"

export const createSecrets = (): SecretPort =>
	isDesktopHost()
		? secretTransport
		: {
				status: async () => ({
					isReady: false,
					needsPassphrase: false,
					hasVault: false,
				}),
				keys: async () => ({
					readable: [],
					unreadable: [],
					inheritedReadable: [],
					inheritedUnreadable: [],
				}),
				set: async () => undefined,
				delete: async () => undefined,
				unlock: async () => undefined,
			}
