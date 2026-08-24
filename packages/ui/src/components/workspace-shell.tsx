import type { ReactNode } from "react"

import {
	AnimatedSidebarInset,
	AnimatedSidebarProvider,
	type AnimatedSidebarProviderProps,
} from "@workspace/ui/components/motion/animated-sidebar"
import { cn } from "@workspace/ui/lib/utils"

interface WorkspaceShellProps
	extends Pick<
		AnimatedSidebarProviderProps,
		"open" | "defaultOpen" | "onOpenChange" | "className"
	> {
	sidebar?: ReactNode
	children: ReactNode
}

const SHELL_ROW = "h-svh"

const WorkspaceShell = ({
	sidebar,
	open,
	defaultOpen,
	onOpenChange,
	children,
	className,
}: WorkspaceShellProps) => (
	<AnimatedSidebarProvider
		data-slot="workspace-shell"
		open={open}
		defaultOpen={defaultOpen}
		onOpenChange={onOpenChange}
		className={cn(SHELL_ROW, className)}
	>
		{sidebar}
		<AnimatedSidebarInset>{children}</AnimatedSidebarInset>
	</AnimatedSidebarProvider>
)

export { WorkspaceShell, type WorkspaceShellProps }
