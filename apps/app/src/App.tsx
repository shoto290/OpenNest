import { useEffect, useMemo } from "react"

import { AgentSidebar } from "@workspace/ui/components/agents/agent-sidebar"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

import { ChatScreen } from "@/components/chat-screen"
import { createChatDriver } from "@/lib/chat/create-driver"
import { sidebarActivityFor } from "@/lib/chat/screen-model"
import { useChat } from "@/lib/chat/use-chat"

export function App() {
	const driver = useMemo(createChatDriver, [])
	const chat = useChat(driver)
	const sidebar = sidebarActivityFor(chat.state)

	useEffect(() => {
		void chat.controller.boot()
	}, [chat.controller])

	return (
		<WorkspaceShell
			sidebar={
				<AgentSidebar
					status={sidebar.isWorking ? "working" : "idle"}
					pose={sidebar.kind}
				/>
			}
		>
			<ChatScreen chat={chat} />
		</WorkspaceShell>
	)
}
