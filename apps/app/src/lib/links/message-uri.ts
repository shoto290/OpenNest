export type MessageUriParts = {
	conversationId: string
	messageId: string
}

const MESSAGE_URI = /^opennest:\/\/c\/([^/]+)\/m\/([^/]+)$/

export const messageUri = (conversationId: string, messageId: string) =>
	`opennest://c/${conversationId}/m/${messageId}`

export const parseMessageUri = (value: string): MessageUriParts | null => {
	const found = MESSAGE_URI.exec(value)
	if (!found) {
		return null
	}
	const [, conversationId, messageId] = found
	return { conversationId, messageId }
}
