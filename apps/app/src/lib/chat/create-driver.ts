import type { ChatDriver } from "./driver"
import { createFakeChatDriver } from "./fake-driver"

import { isDesktopHost } from "../host"
import { agentTransport } from "../agent/transport"

export function createChatDriver(): ChatDriver {
	return isDesktopHost() ? agentTransport : createFakeChatDriver()
}
