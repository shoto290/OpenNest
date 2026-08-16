"use client"

import type { ComponentProps } from "react"

import { Icons } from "@workspace/ui/components/icons"
import { AnimatedSidebarTrigger } from "@workspace/ui/components/motion/animated-sidebar"

type SidebarToggleProps = ComponentProps<typeof AnimatedSidebarTrigger>

const SidebarToggle = (props: SidebarToggleProps) => (
	<AnimatedSidebarTrigger {...props}>
		<Icons.Sidebar className="size-4" />
	</AnimatedSidebarTrigger>
)

export { SidebarToggle, type SidebarToggleProps }
