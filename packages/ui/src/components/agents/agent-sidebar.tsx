"use client"

import { memo } from "react"

import { BotAvatar } from "@workspace/ui/components/bot-avatar"
import type { BotWorkingKind } from "@workspace/ui/components/bot-working"
import {
	AnimatedSidebar,
	AnimatedSidebarContent,
	AnimatedSidebarHeader,
	AnimatedSidebarMenu,
	AnimatedSidebarMenuButton,
	AnimatedSidebarMenuItem,
} from "@workspace/ui/components/motion/animated-sidebar"

const ROW_AVATAR_SIZE = 56
const PANEL_LABEL = "Conversations"
const WINDOW_CONTROLS_INSET = "h-12 p-0"

interface AgentSidebarProps {
	status?: "idle" | "working"
	pose?: BotWorkingKind
	name?: string
	lastMessage?: string
}

const AgentSidebarBase = ({
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
		<AnimatedSidebarHeader className={WINDOW_CONTROLS_INSET} />
		<AnimatedSidebarContent className="pt-0 group-data-[state=collapsed]/sidebar:px-0">
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

/** Hosts render this from a streaming store, so a shallow compare keeps every token from re-measuring the Motion layout projections inside the panel. */
const AgentSidebar = memo(AgentSidebarBase)

export { AgentSidebar, type AgentSidebarProps }
