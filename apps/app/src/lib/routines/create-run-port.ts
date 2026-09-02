import { routinesTransport } from "./routines-transport"
import type { RunPort } from "./run-port"

import { isDesktopHost } from "../host"

export const createRunPort = (): RunPort =>
	isDesktopHost()
		? routinesTransport
		: {
				onRunRequested: async () => () => undefined,
				renewLease: async () => undefined,
				closeRun: async () => undefined,
			}
