import type { ReactNode } from "react"

import {
	AnimatedSidebarInset,
	AnimatedSidebarProvider,
	type AnimatedSidebarProviderProps,
} from "@workspace/ui/components/motion/animated-sidebar"

interface WorkspaceShellProps
	extends Pick<
		AnimatedSidebarProviderProps,
		"open" | "defaultOpen" | "onOpenChange" | "className"
	> {
	/** Full-height leading column, an `AnimatedSidebar`. Omit it and the main
	 * column takes the whole width. */
	sidebar?: ReactNode
	/** The main column. Keeps its own scroll boundary beside the sidebar. */
	children: ReactNode
}

/** The two-column application shell: a collapsible sidebar column and the main column beside it. */
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
		className={className}
	>
		{sidebar}
		<AnimatedSidebarInset>{children}</AnimatedSidebarInset>
	</AnimatedSidebarProvider>
)

export { WorkspaceShell, type WorkspaceShellProps }
