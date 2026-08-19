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
	/** Full-height trailing column, for a panel that belongs beside the main one
	 * rather than over it — settings, inspectors. It keeps its own width and is not
	 * driven by the sidebar's open state.
	 *
	 * There is no closed presentation of it here, and a panel that offers one should
	 * not have it either: omit the column while it is closed and the main one takes
	 * the whole width, rather than leaving a rail beside it that costs width and
	 * shows a bot the roster is already showing. Whatever reopens it belongs in the
	 * main column's own bar.
	 *
	 * The column is a mount, not a collapse: it takes its width on the frame it
	 * appears and gives it back on the frame it goes, deliberately unlike the
	 * sidebar's animated rail. A panel that animates its own width would be
	 * animating the main column's layout with it. */
	panel?: ReactNode
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
		className={cn(SHELL_ROW, className)}
	>
		{sidebar}
		<AnimatedSidebarInset>{children}</AnimatedSidebarInset>
		{panel}
	</AnimatedSidebarProvider>
)

export { WorkspaceShell, type WorkspaceShellProps }
