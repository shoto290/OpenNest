"use client"

import { BotAvatar } from "@workspace/ui/components/bot-avatar"
import type { BotWorkingKind } from "@workspace/ui/components/bot-working"
import {
	AnimatedSidebar,
	AnimatedSidebarContent,
	AnimatedSidebarGroupLabel,
	AnimatedSidebarHeader,
	AnimatedSidebarMenu,
	AnimatedSidebarMenuButton,
	AnimatedSidebarMenuItem,
	AnimatedSidebarProvider,
} from "@workspace/ui/components/motion/animated-sidebar"

const ROW_AVATAR_SIZE = 56
const PANEL_LABEL = "Conversations"

interface AgentSidebarProps {
	status?: "idle" | "working"
	pose?: BotWorkingKind
	name?: string
	lastMessage?: string
}

const AgentSidebar = ({
	status = "idle",
	pose = "thinking",
	name = "No Name",
	lastMessage,
}: AgentSidebarProps) => (
	<AnimatedSidebarProvider>
		<AnimatedSidebar ariaLabel={PANEL_LABEL} collapsible="none">
			<AnimatedSidebarHeader>
				<AnimatedSidebarGroupLabel>{PANEL_LABEL}</AnimatedSidebarGroupLabel>
			</AnimatedSidebarHeader>
			<AnimatedSidebarContent>
				<AnimatedSidebarMenu>
					<AnimatedSidebarMenuItem>
						<AnimatedSidebarMenuButton className="py-2" isActive>
							<span className="flex items-center gap-3">
								<BotAvatar
									className="shrink-0"
									size={ROW_AVATAR_SIZE}
									state={status === "working" ? pose : "waiting"}
								/>
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="truncate">{name}</span>
									<span className="truncate text-sidebar-foreground/70 text-xs">
										{status === "working" ? `${pose}…` : lastMessage}
									</span>
								</span>
							</span>
						</AnimatedSidebarMenuButton>
					</AnimatedSidebarMenuItem>
				</AnimatedSidebarMenu>
			</AnimatedSidebarContent>
		</AnimatedSidebar>
	</AnimatedSidebarProvider>
)

export { AgentSidebar, type AgentSidebarProps }
