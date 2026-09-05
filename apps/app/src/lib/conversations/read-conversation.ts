import type { Conversation } from "./store-contract"
import type { TranscriptStore } from "./store-port"

export type ConversationReader = Pick<
	TranscriptStore,
	"spaces" | "conversations"
>

export const readConversation = async (
	store: ConversationReader,
	conversationId: string,
): Promise<Conversation | null> => {
	const spaces = await store.spaces()
	const seated = await Promise.all(
		spaces.map((space) => store.conversations(space.id)),
	)
	return seated.flat().find(({ id }) => id === conversationId) ?? null
}
