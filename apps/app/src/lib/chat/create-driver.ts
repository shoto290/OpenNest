import type { ChatDriver } from "./driver"
import { createFakeChatDriver } from "./fake-driver"

import { isDesktopHost } from "../host"
import { agentTransport } from "../agent/transport"

/** The Tauri host owns the real CLI. Outside it, `bun dev:web` drives the fake. */
export function createChatDriver(): ChatDriver {
	return isDesktopHost() ? agentTransport : createFakeChatDriver()
}
