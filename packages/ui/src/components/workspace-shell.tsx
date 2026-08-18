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
	/** Full-height trailing column, for a panel that belongs beside the main one
	 * rather than over it — settings, inspectors. It keeps its own width and is not
	 * driven by the sidebar's open state. Omit it and the main column takes the rest
	 * of the width. */
	panel?: ReactNode
	/** The main column. Keeps its own scroll boundary beside the sidebar. */
	children: ReactNode
}

/** The application shell: a collapsible sidebar column, the main column beside it,
 * and an optional panel column after it. */
const WorkspaceShell = ({
	sidebar,
	panel,
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
		{panel}
	</AnimatedSidebarProvider>
)

export { WorkspaceShell, type WorkspaceShellProps }
