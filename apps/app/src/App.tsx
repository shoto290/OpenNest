import { useEffect, useMemo } from "react"

import { AgentSidebar } from "@workspace/ui/components/agents/agent-sidebar"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

import { ChatScreen } from "@/components/chat-screen"
import { createChatDriver } from "@/lib/chat/create-driver"
import {
	lastAssistantTextFor,
	sidebarActivityFor,
} from "@/lib/chat/screen-model"
import { useChat } from "@/lib/chat/use-chat"

export function App() {
	const driver = useMemo(createChatDriver, [])
	const chat = useChat(driver)

	useEffect(() => {
		void chat.controller.boot()
	}, [chat.controller])

	const activity = sidebarActivityFor(chat.state)

	return (
		<WorkspaceShell
			defaultOpen
			sidebar={
				<AgentSidebar
					status={activity.isWorking ? "working" : "idle"}
					pose={activity.kind}
					lastMessage={lastAssistantTextFor(chat.state)}
				/>
			}
		>
			<ChatScreen chat={chat} />
		</WorkspaceShell>
	)
}
