import { useMemo } from "react"

import { ChatScreen } from "@/components/chat-screen"
import { createChatDriver } from "@/lib/chat/create-driver"

export function App() {
	const driver = useMemo(createChatDriver, [])

	return <ChatScreen driver={driver} />
}
