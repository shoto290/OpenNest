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
	/** Full-height leading column, an `AnimatedSidebar`. Omit it and the main
	 * column takes the whole width. */
	sidebar?: ReactNode
	/** The main column. Keeps its own scroll boundary beside the sidebar. */
	children: ReactNode
}

/** The row every column measures against. The sidebar foundation only asks for a
 * minimum height, which leaves the row itself indefinite — and a column that says
 * `h-full` against an indefinite row gets the height of its own content instead of
 * the window's: too tall on a short window, with a gap under it on a tall one. The
 * row is the one place that can settle it, so it is definite here and every column
 * in it can be full height by saying so. */
const SHELL_ROW = "h-svh"

/** The application shell: a collapsible sidebar column and the main column
 * beside it. */
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
