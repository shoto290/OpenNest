import type { ChatDriver } from "./driver"
import { createFakeChatDriver } from "./fake-driver"

import { claudeTransport } from "../claude/transport"

/** The Tauri host owns the real CLI. Outside it, `bun dev:web` drives the fake. */
export function createChatDriver(): ChatDriver {
	return "__TAURI_INTERNALS__" in window
		? claudeTransport
		: createFakeChatDriver()
}
