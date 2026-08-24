import type { ComponentProps, ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

interface AppHeaderProps extends Omit<ComponentProps<"header">, "children"> {
	leading?: ReactNode
	trailing?: ReactNode
	insetWindowControls?: boolean
}

function AppHeader({
	leading,
	trailing,
	insetWindowControls = false,
	className,
	...props
}: AppHeaderProps) {
	return (
		<header
			data-slot="app-header"
			className={cn(
				"flex h-12 shrink-0 items-center gap-3 border-border border-b pr-4",
				insetWindowControls ? "pl-22" : "pl-4",
				className,
			)}
			{...props}
		>
			{leading ? (
				<div className="flex min-w-0 items-center gap-2 font-medium text-sm">
					{leading}
				</div>
			) : null}
			{trailing ? (
				<div className="ml-auto flex shrink-0 items-center gap-2">
					{trailing}
				</div>
			) : null}
		</header>
	)
}

export { AppHeader, type AppHeaderProps }
