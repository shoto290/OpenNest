import type { ReactNode } from "react"

import {
	AnimatedSidebarInset,
	AnimatedSidebarProvider,
	type AnimatedSidebarProviderProps,
} from "@workspace/ui/components/motion/animated-sidebar"

interface WorkspaceShellProps
	extends Pick<
		AnimatedSidebarProviderProps,
		| "open"
		| "defaultOpen"
		| "onOpenChange"
		| "width"
		| "defaultWidth"
		| "onWidthChange"
		| "isResizable"
		| "className"
	> {
	sidebar?: ReactNode
	children: ReactNode
}

const WorkspaceShell = ({
	sidebar,
	open,
	defaultOpen,
	onOpenChange,
	width,
	defaultWidth,
	onWidthChange,
	isResizable,
	children,
	className,
}: WorkspaceShellProps) => (
	<AnimatedSidebarProvider
		data-slot="workspace-shell"
		open={open}
		defaultOpen={defaultOpen}
		onOpenChange={onOpenChange}
		width={width}
		defaultWidth={defaultWidth}
		onWidthChange={onWidthChange}
		isResizable={isResizable}
		className={className}
	>
		{sidebar}
		<AnimatedSidebarInset>{children}</AnimatedSidebarInset>
	</AnimatedSidebarProvider>
)

export { WorkspaceShell, type WorkspaceShellProps }
