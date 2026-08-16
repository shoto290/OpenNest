import { useEffect, useMemo } from "react"

import { ChatScreen } from "@/components/chat-screen"
import { createChatDriver } from "@/lib/chat/create-driver"
import { useChat } from "@/lib/chat/use-chat"

export function App() {
	const driver = useMemo(createChatDriver, [])
	const chat = useChat(driver)

	useEffect(() => {
		void chat.controller.boot()
	}, [chat.controller])

	return <ChatScreen chat={chat} />
}
