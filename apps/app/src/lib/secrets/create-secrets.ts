import type { SecretPort } from "./secret-port"
import { secretTransport } from "./secret-transport"

import { isDesktopHost } from "../host"

export const createSecrets = (): SecretPort =>
	isDesktopHost()
		? secretTransport
		: {
				isReady: async () => false,
				keys: async () => [],
				set: async () => undefined,
				delete: async () => undefined,
			}
