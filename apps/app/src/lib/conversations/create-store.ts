import { createFakeTranscriptStore } from "./fake-transcript-store"
import type { TranscriptStore } from "./store-port"
import { conversationStore } from "./store-transport"

/** The Tauri host owns the database. Outside it, `bun dev:web` keeps the
 * transcript in memory for as long as the tab lives. */
export function createTranscriptStore(): TranscriptStore {
	return "__TAURI_INTERNALS__" in window
		? conversationStore
		: createFakeTranscriptStore()
}
