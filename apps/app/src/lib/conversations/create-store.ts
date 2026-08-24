import { createFakeTranscriptStore } from "./fake-transcript-store"
import type { TranscriptStore } from "./store-port"
import { conversationStore } from "./store-transport"

import { isDesktopHost } from "../host"

export function createTranscriptStore(): TranscriptStore {
	return isDesktopHost() ? conversationStore : createFakeTranscriptStore()
}
