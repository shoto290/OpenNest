"use client"

import { BotAvatar } from "@workspace/ui/components/bot-avatar"
import type { BotWorkingKind } from "@workspace/ui/components/bot-working"
import { Icons } from "@workspace/ui/components/icons"
import {
	AnimatedSidebar,
	AnimatedSidebarContent,
	AnimatedSidebarGroupLabel,
	AnimatedSidebarHeader,
	AnimatedSidebarMenu,
	AnimatedSidebarMenuButton,
	AnimatedSidebarMenuItem,
	AnimatedSidebarTrigger,
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
	<AnimatedSidebar
		aria-busy={status === "working"}
		ariaLabel={PANEL_LABEL}
		collapsible="icon"
	>
		<AnimatedSidebarHeader>
			<div className="flex items-center justify-between gap-2 group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:gap-0">
				<AnimatedSidebarGroupLabel className="min-w-0 truncate">
					{PANEL_LABEL}
				</AnimatedSidebarGroupLabel>
				<AnimatedSidebarTrigger>
					<Icons.Sidebar className="size-4" />
				</AnimatedSidebarTrigger>
			</div>
		</AnimatedSidebarHeader>
		<AnimatedSidebarContent className="group-data-[state=collapsed]/sidebar:px-0">
			<AnimatedSidebarMenu>
				<AnimatedSidebarMenuItem>
					<AnimatedSidebarMenuButton
						className="py-2"
						icon={
							<BotAvatar
								size={ROW_AVATAR_SIZE}
								state={status === "working" ? pose : "waiting"}
							/>
						}
						isActive
						isIconDecorative={false}
						label={name}
					>
						<span className="flex min-w-0 flex-col">
							<span className="truncate">{name}</span>
							<span className="truncate text-sidebar-foreground/80 text-xs">
								{status === "working" ? `${pose}…` : lastMessage}
							</span>
						</span>
					</AnimatedSidebarMenuButton>
				</AnimatedSidebarMenuItem>
			</AnimatedSidebarMenu>
		</AnimatedSidebarContent>
		<span className="sr-only" role="status">
			{status === "working" ? `${name} ${pose}` : null}
		</span>
	</AnimatedSidebar>
)

export { AgentSidebar, type AgentSidebarProps }
